import { Agent, Runner, tool, type AgentInputItem, type ModelProvider } from '@openai/agents';
import { ValidationError } from '$lib/errors';
import {
	drawioSubmissionSchema,
	mermaidSubmissionSchema,
	type DiagramGenerationEvent,
	type DiagramGenerationRequest,
	type DiagramSubmission,
	type DiagramSubmissionDecision
} from '$lib/models/diagrams/generation';
import { z } from 'zod';
import {
	agentToolNameSchema,
	type AgentToolOutcome,
	type ProviderStreamEvent,
	type ProviderToolOutput
} from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import { AgentProviderFailure } from '$lib/errors';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';

import { parseProviderStreamEvent } from '$lib/server/infrastructure/agents/provider-events';

interface DiagramProviderEvents {
	provider(event: ProviderStreamEvent): void;
	submit(draft: DiagramSubmission): Promise<DiagramSubmissionDecision>;
}

/** How the provider's side of a generation ended. */
type GenerationOutcome =
	| { readonly kind: 'completed'; readonly draft: DiagramSubmission }
	| { readonly kind: 'failure'; readonly error: Error };

/**
 * One diagram generation, driven by its caller: it yields the provider's events and each
 * diagram the model submits, takes the caller's decision on a submission through `next`, and
 * returns the accepted diagram. Ending it early aborts the generation and releases the provider.
 */
export type DiagramGenerationRun = AsyncGenerator<
	DiagramGenerationEvent<ProviderStreamEvent>,
	DiagramSubmission | undefined,
	DiagramSubmissionDecision | undefined
>;

export interface DiagramGeneration {
	generate(request: DiagramGenerationRequest, signal: AbortSignal): DiagramGenerationRun;
	/** The agent tool a provider event names; an unknown name fails the generation. */
	toolName(name: string): AgentToolName;
	toolOutcome(output: ProviderToolOutput): AgentToolOutcome;
}

const diagramSubmissionParameters = (kind: 'drawio' | 'mermaid') => {
	const schema = kind === 'drawio' ? drawioSubmissionSchema : mermaidSubmissionSchema;
	const converted = z.toJSONSchema(schema, { io: 'input' });
	if (
		converted.type !== 'object' ||
		converted.additionalProperties !== false ||
		typeof converted.properties !== 'object' ||
		converted.properties === null
	)
		throw new Error('Diagram submission parameters must convert to a strict object schema');
	return {
		type: 'object' as const,
		properties: converted.properties,
		required: Array.isArray(converted.required)
			? converted.required.filter((name): name is string => typeof name === 'string')
			: [],
		additionalProperties: false as const,
		...(converted.description ? { description: converted.description } : {})
	};
};

/** Diagram generation through the agents SDK, against the model provider the factory injects. */
export class DiagramGenerationService implements DiagramGeneration {
	constructor(
		private readonly dependencies: {
			readonly available: boolean;
			readonly models: () => ModelProvider & { close(): Promise<void> };
		}
	) {}
	generate(request: DiagramGenerationRequest, signal: AbortSignal): DiagramGenerationRun {
		if (!this.dependencies.available)
			throw new ValidationError('Diagram AI is disabled until OPENROUTER_API_KEY is configured.');
		return this.run(request, signal);
	}

	private async *run(request: DiagramGenerationRequest, signal: AbortSignal): DiagramGenerationRun {
		const session = new AbortController();
		const combined = AbortSignal.any([signal, session.signal]);
		const queue: DiagramGenerationEvent<ProviderStreamEvent>[] = [];
		const decisions = new Map<
			string,
			{ resolve(decision: DiagramSubmissionDecision): void; reject(error: Error): void }
		>();
		const state: {
			outcome: { readonly kind: 'open' } | GenerationOutcome;
		} = { outcome: { kind: 'open' } };
		let wake: (() => void) | undefined;
		const emit = (event: DiagramGenerationEvent<ProviderStreamEvent>) => {
			queue.push(event);
			wake?.();
		};
		const lease = this.dependencies.models();
		const completion = this.provide(lease, request, combined, {
			provider: (event) => emit({ kind: 'provider', event }),
			submit: (draft) => {
				combined.throwIfAborted();
				const id = crypto.randomUUID();
				return new Promise<DiagramSubmissionDecision>((resolve, reject) => {
					decisions.set(id, { resolve, reject });
					emit({ kind: 'submission', id, draft });
				});
			}
		})
			.then<GenerationOutcome, GenerationOutcome>(
				(draft) => ({ kind: 'completed', draft }),
				// The loop below rethrows a failed generation to the caller.
				(error) => {
					return {
						kind: 'failure',
						error: error instanceof Error ? error : new Error(String(error))
					};
				}
			)
			.then((outcome) => {
				state.outcome = outcome;
				wake?.();
			});
		try {
			while (true) {
				const event = queue.shift();
				if (event) {
					const decision = yield event;
					if (event.kind !== 'submission') continue;
					const pending = decisions.get(event.id);
					decisions.delete(event.id);
					if (!decision) throw new Error('A diagram submission needs a decision.');
					pending?.resolve(decision);
					continue;
				}
				const settled = state.outcome;
				if (settled.kind === 'failure') throw settled.error;
				if (settled.kind === 'completed') return settled.draft;
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
				wake = undefined;
			}
		} finally {
			session.abort(new Error('Diagram generation session closed.'));
			for (const pending of decisions.values())
				pending.reject(new Error('Diagram generation was cancelled.'));
			await completion;
			await lease.close();
		}
	}
	/** Runs the model until it submits a diagram the caller accepts. */
	private async provide(
		provider: ModelProvider,
		request: DiagramGenerationRequest,
		signal: AbortSignal,
		events: DiagramProviderEvents
	): Promise<DiagramSubmission> {
		signal.throwIfAborted();
		let accepted: DiagramSubmission | undefined;
		const kind = request.operation === 'convert' ? 'drawio' : 'mermaid';
		const submit = tool({
			name: kind === 'drawio' ? 'submit_drawio_diagram' : 'submit_mermaid_diagram',
			description:
				kind === 'drawio'
					? 'Submit a title and final uncompressed draw.io mxfile XML. This is the only tool that completes conversion.'
					: 'Submit the final Mermaid source. This is the only tool that completes the diagram task. Labels: for multi-line text use escaped \\n inside quoted labels; never use HTML tags such as <br/>.',
			parameters: diagramSubmissionParameters(kind),
			strict: true,
			errorFunction: (_context, error) =>
				JSON.stringify({ failure: error instanceof Error ? error.message : String(error) }),
			execute: async (value) => {
				signal.throwIfAborted();
				if (accepted) throw new ValidationError('A diagram has already been submitted.');
				const draft: DiagramSubmission =
					kind === 'drawio'
						? { kind, ...drawioSubmissionSchema.parse(value) }
						: { kind, ...mermaidSubmissionSchema.parse(value) };
				const decision = await events.submit(draft);
				signal.throwIfAborted();
				if (decision.kind === 'rejected') throw new ValidationError(decision.message);
				if (accepted) throw new ValidationError('A diagram has already been submitted.');
				accepted = decision.draft;
				return { title: accepted.title, source: accepted.source };
			}
		});
		const agent = new Agent({
			name: 'FollowThrough Diagram Agent',
			model: request.model,
			instructions: request.instructions,
			tools: [submit],
			toolUseBehavior: () =>
				accepted
					? {
							isFinalOutput: true as const,
							isInterrupted: undefined,
							finalOutput: JSON.stringify(accepted)
						}
					: { isFinalOutput: false as const, isInterrupted: undefined }
		});
		const input: string | AgentInputItem[] = request.renderedPngDataUrl
			? [
					{
						role: 'user',
						content: [
							{ type: 'input_text', text: request.prompt },
							{ type: 'input_image', image: request.renderedPngDataUrl }
						]
					}
				]
			: request.prompt;
		const runner = new Runner({ modelProvider: provider, traceIncludeSensitiveData: false });
		const stream = await runner.run(agent, input, { stream: true, maxTurns: 12, signal });
		for await (const event of stream) {
			signal.throwIfAborted();
			events.provider(parseProviderStreamEvent(event));
		}
		await stream.completed;
		signal.throwIfAborted();
		if (!accepted) throw new ValidationError('The Diagram Agent did not submit a valid diagram.');
		return accepted;
	}
	toolName(name: string): AgentToolName {
		const read = agentToolNameSchema.safeParse(name).data;
		if (read === undefined)
			throw new AgentProviderFailure(
				`The provider called "${name}", which is not a tool this agent offers`,
				'UNKNOWN_TOOL_CALL',
				false
			);
		return read;
	}
	toolOutcome(output: ProviderToolOutput): AgentToolOutcome {
		if (output.kind !== 'value') return output;
		const failure = readToolFailure(output.value);
		return failure === undefined
			? { kind: 'succeeded', value: output.value }
			: { kind: 'reported_failure', value: output.value, failure };
	}
}
