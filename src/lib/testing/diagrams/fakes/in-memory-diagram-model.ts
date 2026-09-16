import type { Model, ModelRequest, ModelResponse, StreamEvent } from '@openai/agents';
import type { DiagramSubmission } from '$lib/models/diagrams/generation';

/** A provider model which submits its next candidate on each SDK turn. */
export class InMemoryDiagramModel implements Model {
	private next = 0;
	constructor(private readonly candidates: readonly DiagramSubmission[]) {}
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
						name: candidate.kind === 'drawio' ? 'submit_drawio_diagram' : 'submit_mermaid_diagram',
						arguments: JSON.stringify({ title: candidate.title, source: candidate.source }),
						status: 'completed'
					}
				]
			}
		};
	}
}
