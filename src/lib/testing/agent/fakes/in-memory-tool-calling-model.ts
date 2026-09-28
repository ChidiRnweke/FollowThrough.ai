import { readToolFailure } from '$lib/models/agent/tool-failure';
import type { Model, ModelRequest, ModelResponse, StreamEvent } from '@openai/agents';

/** A model that can correct a call only after the runner delivers its failure. */
export class InMemoryToolCallingModel implements Model {
	constructor(
		private readonly name: string,
		private readonly initial: string,
		private readonly corrected: string,
		private readonly failureText: string
	) {}

	async getResponse(): Promise<ModelResponse> {
		throw new Error('This model requires streaming');
	}

	async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
		const history = JSON.stringify(request.input);
		const corrected = history.includes('call-corrected');
		const last =
			typeof request.input === 'string'
				? undefined
				: request.input.filter((item) => item.type === 'function_call_result').at(-1);
		const outputValue = last?.type === 'function_call_result' ? last.output : undefined;
		const text =
			typeof outputValue === 'object' && outputValue !== null && 'text' in outputValue
				? outputValue.text
				: outputValue;
		const blocked = readToolFailure(text) !== undefined;
		const terminal = blocked && typeof text === 'string' && text.includes('INTERNAL_ERROR');
		const failed = history.includes(this.failureText);
		const output: Extract<StreamEvent, { type: 'response_done' }>['response']['output'] =
			corrected || terminal || (last !== undefined && !blocked)
				? [
						{
							type: 'message',
							role: 'assistant',
							status: 'completed',
							content: [{ type: 'output_text', text: blocked ? 'Blocked' : 'Recovered' }]
						}
					]
				: [
						{
							type: 'function_call',
							name: this.name,
							callId: failed ? 'call-corrected' : 'call-invalid',
							status: 'completed',
							arguments: failed ? this.corrected : this.initial
						}
					];
		yield { type: 'response_started' };
		yield {
			type: 'response_done',
			response: {
				id: crypto.randomUUID(),
				usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				output
			}
		};
	}
}

/** Emits concurrent calls, then stops once their results reach model history. */
export class InMemoryToolBatchModel implements Model {
	constructor(
		private readonly calls: readonly { name: string; callId: string; arguments: string }[]
	) {}
	async getResponse(): Promise<ModelResponse> {
		throw new Error('This model requires streaming');
	}
	async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
		const settled =
			typeof request.input !== 'string' &&
			request.input.some((item) => item.type === 'function_call_result');
		const output: Extract<StreamEvent, { type: 'response_done' }>['response']['output'] = settled
			? [
					{
						type: 'message',
						role: 'assistant',
						status: 'completed',
						content: [{ type: 'output_text', text: 'Finished' }]
					}
				]
			: this.calls.map((call) => ({ type: 'function_call', status: 'completed', ...call }));
		yield { type: 'response_started' };
		yield {
			type: 'response_done',
			response: {
				id: crypto.randomUUID(),
				usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				output
			}
		};
	}
}
