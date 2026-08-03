import { describe, expect, it } from 'vitest';
import type { AgentInputItem } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import { ConversationBuffer } from './buffer';

const conversationId = 'conversation-1' as ConversationId;
const actor: ActorContext = { userId: 'user-1' as ActorContext['userId'] };
const emptyRepository = { list: async () => [] } as unknown as AgentSessionRepository;

const bufferWith = async (items: AgentInputItem[]): Promise<ConversationBuffer> => {
	const buffer = new ConversationBuffer(emptyRepository, actor, conversationId);
	await buffer.addItems(items);
	return buffer;
};

const pngDataUrl = `data:image/png;base64,${'A'.repeat(2048)}`;

describe('ConversationBuffer', () => {
	it('is available as a domain service', () => {
		expect(ConversationBuffer).toBeTypeOf('function');
	});

	it('drops an inline image from the persisted snapshot', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).not.toContain(';base64,');
	});

	it('keeps the text that accompanied a dropped image', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [
					{ type: 'input_text', text: 'What does this diagram show?' },
					{ type: 'input_image', image: pngDataUrl }
				]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.snapshot())).toContain('What does this diagram show?');
	});

	it('leaves an item without an image untouched', async () => {
		const item = { role: 'assistant', content: 'Understood.' } as unknown as AgentInputItem;
		const buffer = await bufferWith([item]);
		expect(await buffer.snapshot()).toEqual([{ role: 'assistant', content: 'Understood.' }]);
	});

	it('still returns the image to the run that is in flight', async () => {
		const buffer = await bufferWith([
			{
				role: 'user',
				content: [{ type: 'input_image', image: pngDataUrl }]
			} as unknown as AgentInputItem
		]);
		expect(JSON.stringify(await buffer.getItems())).toContain(';base64,');
	});
});
