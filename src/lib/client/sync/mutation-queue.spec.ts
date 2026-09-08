import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WriteDraft, WriteReceipt } from '$lib/models/outbox';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import type { OutboxTransport } from './outbox-contracts';
import { MutationQueue } from './mutation-queue';

const firstId = 'a0000000-0000-4000-8000-000000000001';
const secondId = 'a0000000-0000-4000-8000-000000000002';
const thirdId = 'a0000000-0000-4000-8000-000000000003';
const draft = (operationId: string, command = 'Edited'): WriteDraft<string, string> => ({
	operationId,
	command,
	key: 'note:1',
	base: null,
	basedOn: null,
	local: command,
	coalesce: null,
	references: []
});
const applied = (operationId: string, value: string) => ({
	kind: 'applied' as const,
	receipt: {
		operationId,
		resource: { kind: 'found' as const, snapshot: { etag: syncEtag(1n), value } }
	}
});
const setup = (transport: OutboxTransport<string, string>) => {
	const repository = new InMemoryOutbox<string, string>();
	const writerLock = new InMemoryAccountWriterLock();
	const accepted: WriteReceipt<string>['resource'][] = [];
	const dependencies = {
		repository,
		writerLock,
		transport,
		resolveBase: async () => {
			throw new Error('This fixture has no imported draft');
		},
		received: async (_key: string, resource: WriteReceipt<string>['resource']) => {
			accepted.push(resource);
		}
	};
	return { repository, dependencies, accepted, queue: new MutationQueue('alice', dependencies) };
};

describe('shared mutation submission', () => {
	it('durably resolves an imported base before submitting its unchanged operation', async () => {
		const requests: (string | null)[] = [];
		const { dependencies } = setup({
			send: async (input) => {
				requests.push(input.baseEtag);
				return applied(input.operationId, input.command);
			}
		});
		const queue = new MutationQueue('alice', {
			...dependencies,
			resolveBase: async () => ({
				kind: 'matched',
				snapshot: { etag: syncEtag(4n), value: 'Original' }
			})
		});
		await queue.append({ ...draft(firstId), base: { etag: null, value: 'Original' } });
		await queue.flush();
		expect(requests).toEqual([syncEtag(4n)]);
	});
	it('keeps offline writes durable without starting submission', async () => {
		const { queue, repository } = setup({
			send: async () => {
				throw new Error('Offline transport used');
			}
		});
		queue.setOnline(false);
		await queue.append(draft(firstId));
		expect({
			result: await queue.flush(),
			local: (await repository.list('alice'))[0].intent.local
		}).toEqual({ result: { kind: 'offline' }, local: 'Edited' });
	});
	it('coalesces simultaneous flush requests', async () => {
		const { queue } = setup({ send: async (input) => applied(input.operationId, input.command) });
		await queue.append(draft(firstId));
		const first = queue.flush();
		const second = queue.flush();
		await first;
		expect(second).toBe(first);
	});
	it('retries an interrupted request with the same identity and input', async () => {
		const requests: { operationId: string; command: string }[] = [];
		const { queue } = setup({
			send: async (input) => {
				requests.push({ operationId: input.operationId, command: input.command });
				if (requests.length === 1) throw new Error('Connection lost');
				return applied(input.operationId, input.command);
			}
		});
		await queue.append(draft(firstId));
		await queue.flush();
		await queue.append(draft(secondId, 'Later typing'));
		await queue.flush();
		expect(requests).toEqual([
			{ operationId: firstId, command: 'Edited' },
			{ operationId: firstId, command: 'Edited' },
			{ operationId: secondId, command: 'Later typing' }
		]);
	});
	it('publishes receipts only after their queue acknowledgement is durable', async () => {
		const { queue, accepted, repository } = setup({
			send: async (input) => applied(input.operationId, input.command)
		});
		await queue.append(draft(firstId));
		await queue.flush();
		expect({ pending: await repository.list('alice'), accepted }).toEqual({
			pending: [],
			accepted: [applied(firstId, 'Edited').receipt.resource]
		});
	});
	it('continues unrelated writes after a conflict without discarding the conflicting edit', async () => {
		const { queue } = setup({
			send: async (input) =>
				input.operationId === firstId
					? { kind: 'conflict', remote: { kind: 'deleted', etag: syncEtag(2n) } }
					: applied(input.operationId, input.command)
		});
		await queue.append(draft(firstId));
		await queue.append(draft(secondId, 'Further typing'));
		await queue.append({ ...draft(thirdId), key: 'note:2' });
		await queue.flush();
		expect(
			queue.pending.map((entry) => ({
				operationId: entry.intent.operationId,
				status: entry.delivery.kind
			}))
		).toEqual([
			{ operationId: firstId, status: 'conflict' },
			{ operationId: secondId, status: 'queued' }
		]);
	});
	it('does not recover another tab’s active submission', async () => {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const requests: string[] = [];
		const { queue, dependencies } = setup({
			send: async (input) => {
				requests.push(input.operationId);
				started.resolve();
				await release.promise;
				return applied(input.operationId, input.command);
			}
		});
		const other = new MutationQueue('alice', dependencies);
		await queue.append(draft(firstId));
		const first = queue.flush();
		await started.promise;
		const second = other.flush();
		release.resolve();
		await Promise.all([first, second]);
		expect(requests).toEqual([firstId]);
	});
	it('does not submit after logout while loading a queued write', async () => {
		const requests: string[] = [];
		const { queue } = setup({
			send: async (input) => {
				requests.push(input.operationId);
				return applied(input.operationId, input.command);
			}
		});
		await queue.append(draft(firstId));
		queue.subscribe(() => {
			if (queue.pending.some((entry) => entry.delivery.kind === 'sending')) queue.stop();
		});
		await queue.flush();
		expect(requests).toEqual([]);
	});

	it('finishes durable acknowledgement after logout without exposing the old account receipt', async () => {
		const started = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const { queue, repository, accepted } = setup({
			send: async (input) => {
				started.resolve();
				await release.promise;
				return applied(input.operationId, input.command);
			}
		});
		await queue.append(draft(firstId));
		const flushing = queue.flush();
		await started.promise;
		queue.stop();
		release.resolve();
		await flushing;
		expect({ durable: await repository.list('alice'), exposed: queue.pending, accepted }).toEqual({
			durable: [],
			exposed: [],
			accepted: []
		});
	});
});

describe('conflict cache publication', () => {
	it('publishes the server version while keeping the local conflict queued', async () => {
		const snapshot = { etag: syncEtag(2n), value: 'Other client' };
		const { queue, accepted } = setup({
			send: async () => ({ kind: 'conflict', remote: { kind: 'found', snapshot } })
		});
		await queue.append(draft(firstId));
		await queue.flush();
		expect({ received: accepted, local: queue.pending[0].intent.local }).toEqual({
			received: [{ kind: 'found', snapshot }],
			local: 'Edited'
		});
	});
});

describe('shared offline queue reload', () => {
	it('shows another tab’s durable edit without requiring a network connection', async () => {
		const { queue, dependencies } = setup({
			send: async () => {
				throw new Error('Offline transport used');
			}
		});
		queue.setOnline(false);
		await queue.reload();
		const other = new MutationQueue('alice', dependencies);
		other.setOnline(false);
		await other.append(draft(firstId));
		await queue.flush();
		expect(queue.pending.map((entry) => entry.intent.local)).toEqual(['Edited']);
	});
	it('removes another tab’s discarded edit from the offline projection', async () => {
		const { queue, dependencies } = setup({
			send: async () => {
				throw new Error('Offline transport used');
			}
		});
		queue.setOnline(false);
		await queue.append(draft(firstId));
		const other = new MutationQueue('alice', dependencies);
		other.setOnline(false);
		await other.discard([firstId]);
		await queue.flush();
		expect(queue.pending).toEqual([]);
	});
});

it('recognizes an exact acknowledgement committed by another writer', async () => {
	const { queue, repository } = setup({
		send: async () => {
			throw new Error('Another writer submits this operation');
		}
	});
	await queue.append(draft(firstId));
	const sent = await repository.take('alice');
	if (!sent) throw new Error('The queued edit must exist');
	await repository.settle('alice', sent, applied(firstId, 'Edited'));
	await queue.reload();
	expect(queue.acknowledged('note:1', firstId)).toBe(true);
});

it('does not treat disappearance from another writer’s discard as acknowledgement', async () => {
	const { queue, repository } = setup({
		send: async () => {
			throw new Error('This edit is discarded before submission');
		}
	});
	await queue.append(draft(firstId));
	await repository.discard('alice', [firstId]);
	await queue.reload();
	expect(queue.acknowledged('note:1', firstId)).toBe(false);
});
