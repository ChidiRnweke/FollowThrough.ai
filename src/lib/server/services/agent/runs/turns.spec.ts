import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import {
	CHAT_WEB_SEARCH_DEFAULTS,
	type ConversationImageInput,
	type PersistedSessionItem
} from '$lib/models/agent';
import type { FunctionCallResultSessionItem } from '$lib/models/agent/session-item';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import {
	InMemoryModelProvider,
	InMemoryTextModel
} from '$lib/testing/agent/fakes/in-memory-model-provider';
import { callItem, resultItem, userItemWithImage } from '$lib/testing/agent/session-items';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	getGlobalTraceProvider,
	setTraceProcessors,
	tool,
	type Model,
	type ModelResponse,
	type StreamEvent
} from '@openai/agents';
import { z } from 'zod';
import { AgentTurnService } from './turns';

const pngDataUrl = `data:image/png;base64,${'A'.repeat(2048)}`;
const diagramSource = JSON.stringify({ kind: 'drawio', source: '<mxfile>huge</mxfile>' });

/** What the model receives for one turn over `history`, and the items the turn ends with. */
/** A model that asks to call `save_note` once. */
class ParkingModel implements Model {
	async getResponse(): Promise<ModelResponse> {
		throw new Error('This model supports streaming only');
	}
	async *getStreamedResponse(): AsyncIterable<StreamEvent> {
		yield { type: 'response_started' };
		yield {
			type: 'response_done',
			response: {
				id: crypto.randomUUID(),
				usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				output: [
					{
						type: 'function_call',
						callId: 'call-approval',
						name: 'save_note',
						arguments: '{"noteId":"n"}',
						status: 'completed'
					}
				]
			}
		};
	}
}

const turnOver = async (
	history: readonly PersistedSessionItem[],
	prompt: { text: string; images: ConversationImageInput[] } = { text: 'Next', images: [] },
	options: { model?: Model; tools?: ReturnType<typeof tool>[] } = {}
) => {
	const model = options.model ?? new InMemoryTextModel('Done');
	const provider = new InMemoryModelProvider(model);
	const turns = new AgentTurnService({
		models: () => provider,
		images: capabilityDependencies<Pick<OpenAI, 'chat'>>({})
	});
	const turn = await turns.turn({
		model: 'test/model',
		instructions: 'Help',
		webSearch: CHAT_WEB_SEARCH_DEFAULTS,
		tools: options.tools ?? [],
		conversationId: 'conversation-1',
		history,
		prompt,
		maxTurns: 2,
		signal: new AbortController().signal,
		recovery: new AgentToolRecoveryService().configuration([], []),
		decisions: [],
		serializedState: undefined
	});
	for await (const _event of turn.events) void _event;
	const outcome = await turn.outcome();
	await turn.close();
	const requests = model instanceof InMemoryTextModel ? model.requests : [];
	return { seen: JSON.stringify(requests[0]?.input), outcome, provider };
};

describe('What the model sees of a conversation', () => {
	// An mxfile is 5–8 KB and rides in both the call and its result, so a
	// conversation with a few revisions replayed tens of kilobytes of markup every
	// turn for a document the agent almost never needed to re-read.
	it('replaces diagram source with a pointer to read_canvas_diagram', async () => {
		const { seen } = await turnOver([
			callItem('create_diagram', 'diagram-call', diagramSource),
			resultItem('create_diagram', 'diagram-call', diagramSource)
		]);
		expect({
			elided: !seen.includes('<mxfile>huge</mxfile>'),
			readback: seen.includes('read_canvas_diagram')
		}).toEqual({ elided: true, readback: true });
	});

	// `read_canvas_diagram` only answers with the last version that worked, so the
	// source of a call that failed is the only record of what the model tried.
	it('keeps the source of a presentation that failed', async () => {
		const { seen } = await turnOver([
			callItem(
				'create_diagram',
				'diagram-call',
				JSON.stringify({ source: '<mxfile>rejected</mxfile>' })
			),
			resultItem(
				'create_diagram',
				'diagram-call',
				JSON.stringify({
					kind: 'failure',
					code: 'VALIDATION',
					message: 'draw.io XML is malformed',
					recovery: 'Correct the XML.',
					details: {}
				})
			)
		]);
		expect(seen).toContain('<mxfile>rejected</mxfile>');
	});

	it('leaves another tool’s arguments alone', async () => {
		const { seen } = await turnOver([
			callItem('save_note', 'note-call', JSON.stringify({ source: 'keep me' })),
			resultItem('save_note', 'note-call', JSON.stringify({ saved: true }))
		]);
		expect(seen).toContain('keep me');
	});

	it.each([
		['the bare string form', diagramSource, false],
		['the text part form', { type: 'text', text: diagramSource }, false],
		[
			'the multi-part form, which carries no single text',
			[{ type: 'text', text: diagramSource }],
			true
		]
	] as const)('reads a diagram result in %s', async (_form, output, kept) => {
		const result: FunctionCallResultSessionItem = {
			type: 'function_call_result',
			name: 'create_diagram',
			callId: 'call-1',
			status: 'completed',
			output: output as FunctionCallResultSessionItem['output']
		};
		const { seen } = await turnOver([result]);
		expect(seen.includes('<mxfile>huge</mxfile>')).toBe(kept);
	});

	it('shows an attached image to the model and returns it with the turn', async () => {
		const { seen, outcome } = await turnOver([], {
			text: 'What does this diagram show?',
			images: [{ id: 'image-1', mediaType: 'image/png', dataUrl: pngDataUrl, name: 'diagram.png' }]
		});
		expect({
			shown: seen.includes(';base64,'),
			returned: JSON.stringify(outcome.sessionItems).includes(';base64,')
		}).toEqual({ shown: true, returned: true });
	});

	it('releases the provider lease when the turn closes', async () => {
		const { provider } = await turnOver([userItemWithImage('Hello', 'https://example.test/a.png')]);
		expect(provider.closed).toBe(true);
	});
});

describe('A turn that parks on an approval', () => {
	const approvalTool = tool({
		name: 'save_note',
		description: 'Save a note',
		parameters: z.object({ noteId: z.string() }),
		needsApproval: true,
		execute: async () => ({ ok: true })
	});

	it('reports the parked call', async () => {
		const { outcome } = await turnOver([], undefined, {
			model: new ParkingModel(),
			tools: [approvalTool]
		});
		expect(outcome).toMatchObject({
			kind: 'approval',
			pending: [{ callId: 'call-approval', toolName: 'save_note', arguments: { noteId: 'n' } }]
		});
	});

	it('ends the SDK agent span before the checkpoint is published', async () => {
		// The SDK disables tracing under NODE_ENV=test; re-enable so the recording
		// processor observes the SDK span lifecycle.
		getGlobalTraceProvider().setDisabled(false);
		const ended: string[] = [];
		setTraceProcessors([
			{
				async onTraceStart() {},
				async onTraceEnd() {},
				async onSpanStart() {},
				async onSpanEnd(span: { spanData?: { type?: string } }) {
					ended.push(String(span.spanData?.type));
				},
				async shutdown() {},
				async forceFlush() {}
			}
		]);
		try {
			await turnOver([], undefined, { model: new ParkingModel(), tools: [approvalTool] });
		} finally {
			setTraceProcessors([]);
		}
		expect(ended).toContain('agent');
	});
});
