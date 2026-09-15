import type {
	Model,
	ModelProvider,
	ModelRequest,
	ModelResponse,
	StreamEvent
} from '@openai/agents';

/** A model lease that becomes unusable after the owner releases it. */
export class InMemoryModelProvider implements ModelProvider {
	closed = false;
	constructor(private readonly model: Model) {}
	async getModel(): Promise<Model> {
		if (this.closed) throw new Error('Model provider is closed');
		return this.model;
	}
	async close(): Promise<void> {
		this.closed = true;
	}
}

export class InMemoryTextModel implements Model {
	readonly requests: ModelRequest[] = [];
	constructor(private readonly text: string) {}
	async getResponse(): Promise<ModelResponse> {
		throw new Error('This model supports streaming only');
	}
	async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
		this.requests.push(request);
		yield { type: 'response_started' };
		yield {
			type: 'response_done',
			response: {
				id: crypto.randomUUID(),
				usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				output: [
					{
						type: 'message',
						role: 'assistant',
						status: 'completed',
						content: [{ type: 'output_text', text: this.text }]
					}
				]
			}
		};
	}
}
