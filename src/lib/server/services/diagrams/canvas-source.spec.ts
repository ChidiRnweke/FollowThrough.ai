import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import { callItem, resultItem } from '$lib/testing/agent/session-items';
import { PresentedCanvasSource, type CanvasSourceItems } from './canvas-source';
import { testDiagramId } from '$lib/testing/workspace/fixtures/domain-builders';

const actor = { userId: 'user-1' as ActorContext['userId'] };
const conversation = 'conversation-1' as ConversationId;

const itemsOf = (...rows: { item: PersistedSessionItem }[]): CanvasSourceItems => ({
	list: async () => rows
});

describe('The diagram on a conversation canvas', () => {
	const result = (diagramId: string, name = 'create_diagram') => ({
		item: resultItem(name, `call-${diagramId}`, JSON.stringify({ diagramId }))
	});

	it('is the diagram the conversation last wrote', async () => {
		const reader = new PresentedCanvasSource(itemsOf(result(testDiagramId())));
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId());
	});

	it('is the most recent write when there are several', async () => {
		const reader = new PresentedCanvasSource(
			itemsOf(result(testDiagramId(1)), result(testDiagramId(2), 'edit_diagram'))
		);
		expect(await reader.latest(actor, conversation)).toBe(testDiagramId(2));
	});

	it('says nothing when the conversation has drawn nothing', async () => {
		const reader = new PresentedCanvasSource(itemsOf());
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	// The call carries what was proposed; only the result names what was stored.
	it('ignores the call and reads the result', async () => {
		const call = {
			item: callItem('create_diagram', 'call-9', JSON.stringify({ diagramId: testDiagramId(9) }))
		};
		const reader = new PresentedCanvasSource(itemsOf(call));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});

	it('ignores another tool that happens to answer with a diagram id', async () => {
		const reader = new PresentedCanvasSource(itemsOf(result(testDiagramId(), 'save_note')));
		expect(await reader.latest(actor, conversation)).toBeUndefined();
	});
});
