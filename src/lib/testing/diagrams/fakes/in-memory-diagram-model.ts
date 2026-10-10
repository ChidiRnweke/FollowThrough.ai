import type { Model, ModelRequest, ModelResponse, StreamEvent } from '@openai/agents';
import type { DiagramSubmission } from '$lib/models/diagrams/generation';

/**
 * A candidate the model submits: a draft, or argument text exactly as a model
 * might send it — malformed JSON or a value the submission schema rejects.
 */
export type DiagramCandidate =
	| DiagramSubmission
	| {
			readonly kind: 'raw';
			readonly format: DiagramSubmission['kind'];
			readonly arguments: string;
	  };

/** A provider model which submits its next candidate on each SDK turn. */
export class InMemoryDiagramModel implements Model {
	private next = 0;
	constructor(private readonly candidates: readonly DiagramCandidate[]) {}
	async getResponse(): Promise<ModelResponse> {
		throw new Error('Diagram generation requires streaming.');
	}
	async *getStreamedResponse(_request: ModelRequest): AsyncIterable<StreamEvent> {
		void _request;
		const candidate = this.candidates[this.next++];
		if (!candidate) throw new Error('No diagram candidates remain.');
		yield { type: 'response_started' };
		yield {
			type: 'response_done',
			response: {
				id: crypto.randomUUID(),
				usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				output: [
					{
						type: 'function_call',
						callId: crypto.randomUUID(),
						name:
							(candidate.kind === 'raw' ? candidate.format : candidate.kind) === 'drawio'
								? 'submit_drawio_diagram'
								: 'submit_mermaid_diagram',
						arguments:
							candidate.kind === 'raw'
								? candidate.arguments
								: JSON.stringify({ title: candidate.title, source: candidate.source }),
						status: 'completed'
					}
				]
			}
		};
	}
}
