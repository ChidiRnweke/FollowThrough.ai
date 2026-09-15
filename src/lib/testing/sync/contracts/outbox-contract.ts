import { expect, it } from 'vitest';
import type { OutboxRepository } from '$lib/client/sync/outbox-contracts';
import type { WriteDraft } from '$lib/models/outbox';
import { syncEtag } from '$lib/models/sync';

const draft = (command: string): WriteDraft<string, string> => ({
	operationId: crypto.randomUUID(),
	key: 'note',
	command,
	local: command,
	base: null,
	basedOn: null,
	coalesce: 'body',
	references: []
});

export const outboxRepositoryContract = (create: () => OutboxRepository<string, string>): void => {
	it('never coalesces new input into an attempted operation', async () => {
		const repository = create();
		const first = draft('First');
		await repository.append('alice', first);
		await repository.take('alice');
		await repository.retry('alice', first.operationId, 'Response lost');
		await repository.append('alice', { ...draft('Second'), basedOn: first.operationId });
		expect((await repository.list('alice')).map((entry) => entry.intent.command)).toEqual([
			'First',
			'Second'
		]);
	});
	it('settles intent and retains its authoritative proof together', async () => {
		const repository = create();
		const first = draft('First');
		await repository.append('alice', first);
		const sent = await repository.take('alice');
		if (!sent) throw new Error('The queued intent was not available');
		const receipt = {
			operationId: first.operationId,
			resource: { kind: 'found' as const, snapshot: { etag: syncEtag(1n), value: 'Saved' } }
		};
		await repository.settle('alice', sent, { kind: 'applied', receipt });
		expect({
			pending: await repository.list('alice'),
			receipt: await repository.receipt('alice', 'note')
		}).toEqual({ pending: [], receipt });
	});
	it('requires the complete descendant set for a destructive decision', async () => {
		const repository = create();
		const first = draft('First');
		await repository.append('alice', first);
		await repository.append('alice', {
			...draft('Second'),
			basedOn: first.operationId,
			coalesce: null
		});
		await expect(repository.discard('alice', [first.operationId])).rejects.toThrow('dependent');
	});
};
