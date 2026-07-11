import { describe, expect, it } from 'vitest';
import type { ActorContext, TextSelection } from '../models';
import { DemoControllerFactory, demoIds } from './index';

const actor: ActorContext = { userId: demoIds.user };
const selection: TextSelection = {
	noteId: demoIds.note,
	revision: 1,
	from: 0,
	to: 10,
	text: 'I will send it.'
};

describe('DemoControllerFactory', () => {
	it('returns deterministic default workflow data', async () => {
		await expect(
			new DemoControllerFactory().extractPromises().execute(actor, { selection })
		).resolves.toMatchObject({ createdTodos: [{ title: 'Send the design' }] });
	});
	it('returns intentional empty states', async () => {
		await expect(
			new DemoControllerFactory('empty').reference().execute(actor, { selection })
		).resolves.toEqual({ outcome: 'nothing_relevant', anchorId: demoIds.anchor });
	});
	it('returns intentional error states', async () => {
		await expect(
			new DemoControllerFactory('error').relate().execute(actor, { selection })
		).rejects.toThrow('Demo scenario failure');
	});
	it('streams deterministic agent events', async () => {
		const events = [];
		for await (const event of new DemoControllerFactory()
			.runAgent()
			.execute(actor, { prompt: 'Draft it' }))
			events.push(event);
		expect(events).toHaveLength(3);
	});
});
