import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import {
	Agent,
	Runner,
	type Model,
	type ModelRequest,
	type ModelResponse,
	type StreamEvent
} from '@openai/agents';
import { describe, expect, it } from 'vitest';
const recovery = new AgentToolRecoveryService();
class RecoveringToolCallModel implements Model {
	async getResponse(): Promise<ModelResponse> {
		throw new Error('This fake is only used for streaming runs');
	}

	async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
		const recovered = JSON.stringify(request.input).includes('has not been surfaced');
		const output = recovered
			? [
					{
						type: 'message' as const,
						role: 'assistant' as const,
						status: 'completed' as const,
						content: [{ type: 'output_text' as const, text: 'Recovered' }]
					}
				]
			: [
					{
						type: 'function_call' as const,
						callId: 'call-missing-tool',
						name: 'save_note',
						status: 'completed' as const,
						arguments: '{}'
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
const formattedMissingTool = async (
	toolName: string,
	directNames: readonly string[],
	catalogNames: readonly string[]
): Promise<Readonly<Record<string, unknown>>> => {
	const formatter = recovery.configuration(directNames, catalogNames).toolErrorFormatter!;
	const output = await formatter({
		kind: 'tool_not_found',
		toolType: 'function',
		toolName,
		callId: 'call-1',
		defaultMessage: `Tool '${toolName}' not found.`,
		runContext: {} as never
	});
	return JSON.parse(output!) as Readonly<Record<string, unknown>>;
};
describe('Unknown agent tool recovery', () => {
	it('orders equally close suggestions by name across both tool surfaces', async () => {
		expect(await formattedMissingTool('bat', ['hat'], ['cat'])).toMatchObject({
			details: {
				suggestions: [
					{ name: 'cat', invokeVia: 'search_first' },
					{ name: 'hat', invokeVia: 'direct' }
				]
			}
		});
	});

	it('includes names three edits away and excludes names four edits away', async () => {
		expect(await formattedMissingTool('abc', ['abcdef', 'abcdefg'], [])).toMatchObject({
			details: { suggestions: [{ name: 'abcdef', invokeVia: 'direct' }] }
		});
	});

	it('returns each suggested name once when both surfaces contain duplicates', async () => {
		expect(
			await formattedMissingTool('serch', ['search', 'search'], ['search', 'search'])
		).toMatchObject({ details: { suggestions: [{ name: 'search', invokeVia: 'direct' }] } });
	});

	it('sends an undiscovered catalog tool through search and back to itself', async () => {
		expect(await formattedMissingTool('save_note', ['search'], ['save_note'])).toEqual({
			kind: 'failure',
			code: 'TOOL_NOT_AVAILABLE',
			message: 'Tool "save_note" exists but has not been surfaced in this conversation yet.',
			details: { suggestions: [{ name: 'save_note', invokeVia: 'search_first' }] },
			recovery:
				'Call "search_tools" with a query describing what you want to do, then call "save_note" directly by that name with flat top-level arguments matching the schema it returns.'
		});
	});

	it('treats an already-enabled catalog tool as directly callable', async () => {
		expect(await formattedMissingTool('save_nte', ['save_note'], ['save_note'])).toMatchObject({
			details: { suggestions: [{ name: 'save_note', invokeVia: 'direct' }] }
		});
	});

	it('returns every close enabled and undiscovered suggestion', async () => {
		expect(await formattedMissingTool('save_nte', ['save_notes'], ['save_note'])).toMatchObject({
			details: {
				suggestions: [
					{ name: 'save_note', invokeVia: 'search_first' },
					{ name: 'save_notes', invokeVia: 'direct' }
				]
			}
		});
	});

	it('sends unmatched names back to tool search', async () => {
		expect(
			await formattedMissingTool('completely_different', ['search'], ['save_note'])
		).toMatchObject({
			details: { suggestions: [] },
			recovery:
				'Call "search_tools" to discover the capability, then call the name it returns directly with flat top-level arguments.'
		});
	});

	it('continues a streamed SDK run after an unknown function call', async () => {
		const agent = new Agent({
			name: 'Recovery test agent',
			instructions: 'Finish after the tool error.',
			model: new RecoveringToolCallModel(),
			tools: []
		});
		const stream = await new Runner().run(agent, 'Save this note', {
			stream: true,
			maxTurns: 3,
			...recovery.configuration([], ['save_note'])
		});
		for await (const event of stream) {
			// Consume the stream so the SDK can perform its recovery turn.
			void event;
		}
		await stream.completed;
		expect(stream.finalOutput).toBe('Recovered');
	});
});

it('retains discovered and parked tools only while current authority offers them', () => {
	expect(
		recovery.promoted(
			['search', 'save_note', 'search'],
			['archive_note', 'save_note'],
			['search', 'archive_note']
		)
	).toEqual(['search', 'archive_note']);
});
