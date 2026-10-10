import type {
	DiagramProvider,
	DiagramProviderFactory,
	DiagramProviderEvents
} from '$lib/server/controllers/diagrams/controller';
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
import type { DiagramGenerationRequest, DiagramSubmission } from '$lib/models/diagrams/generation';

import { parseProviderStreamEvent } from '$lib/server/adapters/agent/provider-events';
import {
	diagramSubmissionParameters,
	readDiagramSubmission
} from '$lib/server/adapters/diagrams/submissions';

export class AgentSdkDiagramProvider implements DiagramProvider {
	constructor(private readonly provider: ModelProvider & { close(): Promise<void> }) {}
	async run(
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
				const draft = readDiagramSubmission(value, kind);
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
		const runner = new Runner({ modelProvider: this.provider, traceIncludeSensitiveData: false });
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
	close(): Promise<void> {
		return this.provider.close();
	}
}
export class OpenAIDiagramProviders implements DiagramProviderFactory {
	constructor(
		private readonly config: {
			readonly apiKey: string;
			readonly baseURL: string;
			readonly appURL: string;
		}
	) {}
	create(): DiagramProvider {
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
		return new AgentSdkDiagramProvider(provider);
	}
}
