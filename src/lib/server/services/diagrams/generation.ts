import {
	Agent,
	OpenAIProvider,
	Runner,
	tool,
	type AgentInputItem,
	type ModelProvider
} from '@openai/agents';
import OpenAI from 'openai';
import { ValidationError } from '$lib/errors';
import type {
	DiagramGenerationEvent as GenerationEvent,
	DiagramGenerationRequest,
	DiagramSubmission,
	DiagramSubmissionDecision
} from '$lib/models/diagrams/generation';
import type { ProviderStreamEvent } from '$lib/models/agent';

export type DiagramGenerationEvent = GenerationEvent<ProviderStreamEvent>;
import { parseProviderStreamEvent } from '$lib/server/repositories/agent/provider-events';
import {
	diagramSubmissionParameters,
	readDiagramSubmission
} from '$lib/server/repositories/diagrams/submissions';

export interface DiagramGenerationSession {
	readonly events: AsyncIterable<DiagramGenerationEvent>;
	respond(id: string, decision: DiagramSubmissionDecision): void;
	result(): Promise<DiagramSubmission>;
	close(): Promise<void>;
}

export interface DiagramGenerator {
	open(request: DiagramGenerationRequest, signal?: AbortSignal): DiagramGenerationSession;
}

type Completion =
	| { readonly kind: 'completed'; readonly draft: DiagramSubmission }
	| { readonly kind: 'failure'; readonly error: Error };

/** Transports provider events and submission requests to the controlling workflow. */
export class DiagramProviderSession implements DiagramGenerationSession {
	private readonly abort = new AbortController();
	private readonly queue: DiagramGenerationEvent[] = [];
	private readonly decisions = new Map<
		string,
		{
			resolve: (decision: DiagramSubmissionDecision) => void;
			reject: (error: Error) => void;
		}
	>();
	private wake: (() => void) | undefined;
	private state: { kind: 'open' } | Completion = { kind: 'open' };
	private readonly completion: Promise<Completion>;
	readonly events: AsyncIterable<DiagramGenerationEvent>;

	constructor(
		private readonly provider: ModelProvider & { close(): Promise<void> },
		private readonly request: DiagramGenerationRequest,
		signal?: AbortSignal
	) {
		this.events = this.readEvents();
		const combined = signal ? AbortSignal.any([signal, this.abort.signal]) : this.abort.signal;
		this.completion = this.produce(combined)
			.then(
				(draft): Completion => ({ kind: 'completed', draft }),
				(error): Completion => {
					return {
						kind: 'failure',
						error: error instanceof Error ? error : new Error(String(error))
					};
				}
			)
			.then((completion) => {
				this.state = completion;
				this.wake?.();
				return completion;
			});
	}

	respond(id: string, decision: DiagramSubmissionDecision): void {
		const pending = this.decisions.get(id);
		if (!pending) throw new Error('Diagram submission is no longer awaiting a decision.');
		this.decisions.delete(id);
		pending.resolve(decision);
	}

	async result(): Promise<DiagramSubmission> {
		const completion = await this.completion;
		if (completion.kind === 'failure') throw completion.error;
		return completion.draft;
	}

	async close(): Promise<void> {
		this.abort.abort(new Error('Diagram generation session closed.'));
		await this.completion;
	}

	private emit(event: DiagramGenerationEvent): void {
		this.queue.push(event);
		this.wake?.();
	}

	private async *readEvents(): AsyncGenerator<DiagramGenerationEvent> {
		while (true) {
			const event = this.queue.shift();
			if (event) {
				yield event;
				continue;
			}
			if (this.state.kind === 'failure') throw this.state.error;
			if (this.state.kind === 'completed') return;
			await new Promise<void>((resolve) => {
				this.wake = resolve;
			});
			this.wake = undefined;
		}
	}

	private async produce(signal: AbortSignal): Promise<DiagramSubmission> {
		const cancel = () => {
			for (const pending of this.decisions.values())
				pending.reject(new Error('Diagram generation was cancelled.'));
			this.decisions.clear();
		};
		signal.addEventListener('abort', cancel, { once: true });
		try {
			signal.throwIfAborted();
			let accepted: DiagramSubmission | undefined;
			const kind = this.request.operation === 'convert' ? 'drawio' : 'mermaid';
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
					const draft = readDiagramSubmission(value, kind);
					const id = crypto.randomUUID();
					const decision = await new Promise<DiagramSubmissionDecision>((resolve, reject) => {
						this.decisions.set(id, { resolve, reject });
						this.emit({ kind: 'submission', id, draft });
					});
					signal.throwIfAborted();
					if (decision.kind === 'rejected') throw new ValidationError(decision.message);
					if (accepted) throw new ValidationError('A diagram has already been submitted.');
					accepted = decision.draft;
					return { title: accepted.title, source: accepted.source };
				}
			});
			const agent = new Agent({
				name: 'FollowThrough Diagram Agent',
				model: this.request.model,
				instructions: this.request.instructions,
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
			const input: string | AgentInputItem[] = this.request.renderedPngDataUrl
				? [
						{
							role: 'user',
							content: [
								{ type: 'input_text', text: this.request.prompt },
								{ type: 'input_image', image: this.request.renderedPngDataUrl }
							]
						}
					]
				: this.request.prompt;
			const runner = new Runner({ modelProvider: this.provider, traceIncludeSensitiveData: false });
			const stream = await runner.run(agent, input, { stream: true, maxTurns: 12, signal });
			for await (const event of stream) {
				signal.throwIfAborted();
				this.emit({ kind: 'provider', event: parseProviderStreamEvent(event) });
			}
			await stream.completed;
			signal.throwIfAborted();
			if (!accepted) throw new ValidationError('The Diagram Agent did not submit a valid diagram.');
			return accepted;
		} finally {
			signal.removeEventListener('abort', cancel);
			cancel();
			await this.provider.close();
		}
	}
}

export class DiagramGeneration implements DiagramGenerator {
	constructor(private readonly config: { apiKey: string; baseURL: string; appURL: string }) {}

	open(request: DiagramGenerationRequest, signal?: AbortSignal): DiagramGenerationSession {
		if (!this.config.apiKey)
			throw new ValidationError('Diagram AI is disabled until OPENROUTER_API_KEY is configured.');
		const provider = new OpenAIProvider({
			openAIClient: new OpenAI({
				apiKey: this.config.apiKey,
				baseURL: this.config.baseURL,
				defaultHeaders: {
					'HTTP-Referer': this.config.appURL,
					'X-OpenRouter-Title': 'FollowThrough'
				}
			}),
			useResponses: false,
			strictFeatureValidation: true
		});
		return new DiagramProviderSession(provider, request, signal);
	}
}
