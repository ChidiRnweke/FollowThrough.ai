import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import { callItem, resultItem } from '$lib/testing/agent/session-items';
import { PresentedCanvasSource } from './canvas-source';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { testDiagramId } from '$lib/testing/workspace/fixtures/domain-builders';

const actor = { userId: 'user-1' as ActorContext['userId'] };
const conversation = 'conversation-1' as ConversationId;

const itemsOf = async (...rows: { item: PersistedSessionItem }[]) => {
	const repository = new InMemoryAgentSessionRepository();
	await repository.append(
		actor,
		conversation,
		rows.map((row) => row.item)
	);
	return repository;
};

describe('The diagram on a conversation canvas', () => {
	const result = (diagramId: string, name = 'create_diagram') => ({
		item: resultItem(name, `call-${diagramId}`, JSON.stringify({ diagramId }))
	});

	it('is the diagram the conversation last wrote', async () => {
		const reader = new PresentedCanvasSource(await itemsOf(result(testDiagramId())));
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId());
	});

	it('is the most recent write when there are several', async () => {
		const reader = new PresentedCanvasSource(
			await itemsOf(result(testDiagramId(1)), result(testDiagramId(2), 'edit_diagram'))
		);
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId(2));
	});

	it('says nothing when the conversation has drawn nothing', async () => {
		const reader = new PresentedCanvasSource(await itemsOf());
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	// The call carries what was proposed; only the result names what was stored.
	it('ignores the call and reads the result', async () => {
		const call = {
			item: callItem('create_diagram', 'call-9', JSON.stringify({ diagramId: testDiagramId(9) }))
		};
		const reader = new PresentedCanvasSource(await itemsOf(call));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	it('ignores another tool that happens to answer with a diagram id', async () => {
		const reader = new PresentedCanvasSource(await itemsOf(result(testDiagramId(), 'save_note')));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	it('keeps the saved diagram after a failed edit result', async () => {
		const reader = new PresentedCanvasSource(
			await itemsOf(result(testDiagramId()), {
				item: resultItem('edit_diagram', 'failed', JSON.stringify({ failure: 'Stale revision' }))
			})
		);
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId());
	});

	it('does not hide malformed output behind an earlier successful write', async () => {
		const reader = new PresentedCanvasSource(
			await itemsOf(result(testDiagramId()), { item: resultItem('edit_diagram', 'corrupt', '{') })
		);
		await expect(reader.latest(actor, conversation)).rejects.toThrow();
	});

	it('uses a later saved diagram without reading superseded malformed output', async () => {
		const reader = new PresentedCanvasSource(
			await itemsOf({ item: resultItem('edit_diagram', 'corrupt', '{') }, result(testDiagramId()))
		);
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId());
	});

	it('does not lose an older canvas behind unrelated conversation history', async () => {
		const reader = new PresentedCanvasSource(
			await itemsOf(
				result(testDiagramId()),
				...Array.from({ length: 250 }, (_, index) => ({
					item: callItem('search', `call-${index}`, '{}')
				}))
			)
		);
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId());
	});
});
