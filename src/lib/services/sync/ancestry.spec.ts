import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { OutboxEntry, WriteDraft, WriteRebase } from '$lib/models/outbox';
import { appendWrite, rebaseConflictedWrite, rebaseDraft } from '$lib/services/sync/state';
import { rebaseFields } from '$lib/services/sync/rebase';

interface Task {
	readonly title: string;
	readonly status: 'open' | 'done';
}
const rebase: WriteRebase<Task> = (observed, local, onto) =>
	rebaseFields(observed, local, onto, new Set());
const firstId = 'a0000000-0000-4000-8000-000000000001';
const secondId = 'a0000000-0000-4000-8000-000000000002';
const thirdId = 'a0000000-0000-4000-8000-000000000003';
const original = { etag: syncEtag(1n), value: { title: 'Draft', status: 'open' as const } };
const draft = (operationId: string, local: Task): WriteDraft<string, Task> => ({
	operationId,
	key: 'todos:1',
	command: operationId,
	base: original,
	basedOn: null,
	local,
	coalesce: null,
	references: []
});
const completed = draft(firstId, { title: 'Draft', status: 'done' });
const renamedFromOriginal = draft(secondId, { title: 'Renamed', status: 'open' });
const queued = appendWrite([], completed, 1);

describe('ancestry chosen by the durable queue', () => {
	it('stacks an edit made from a superseded version on the latest local edit', () => {
		const result = rebaseDraft(queued, renamedFromOriginal, null, rebase);
		expect({ basedOn: result.basedOn, local: result.local, base: result.base }).toEqual({
			basedOn: firstId,
			local: { title: 'Renamed', status: 'done' },
			base: original
		});
	});
	it('leaves an edit made from the latest local edit unchanged', () => {
		const current = { ...renamedFromOriginal, basedOn: firstId };
		expect(rebaseDraft(queued, current, null, rebase)).toBe(current);
	});
	it('bases an edit made from a superseded version on this device’s newer acknowledged write', () => {
		const snapshot = { etag: syncEtag(2n), value: { title: 'Draft', status: 'done' as const } };
		expect(
			rebaseDraft(
				[],
				renamedFromOriginal,
				{ operationId: firstId, resource: { kind: 'found', snapshot } },
				rebase
			)
		).toEqual({
			...renamedFromOriginal,
			base: snapshot,
			local: { title: 'Renamed', status: 'done' }
		});
	});
});

const conflicted = (
	local: Task,
	remote: OutboxEntry<string, Task>['delivery'] & { kind: 'conflict' }
): OutboxEntry<string, Task>[] => [
	{ sequence: 1, intent: { ...queued[0].intent, local }, delivery: remote }
];
const found = (value: Task) => ({
	kind: 'conflict' as const,
	remote: { kind: 'found' as const, snapshot: { etag: syncEtag(2n), value } }
});
const renamed = found({ title: 'Renamed', status: 'open' });

describe('automatic rebase of a server conflict', () => {
	it('queues the edit again on the server version when the fields do not overlap', () => {
		const [entry] = rebaseConflictedWrite(
			conflicted({ title: 'Draft', status: 'done' }, renamed),
			firstId,
			rebase
		);
		expect({
			operationId: entry.intent.operationId,
			base: entry.intent.base,
			local: entry.intent.local,
			delivery: entry.delivery
		}).toEqual({
			operationId: firstId,
			base: renamed.remote.snapshot,
			local: { title: 'Renamed', status: 'done' },
			delivery: { kind: 'queued' }
		});
	});
	it('keeps an edit for review when the server changed the same field', () => {
		const entries = conflicted(
			{ title: 'Mine', status: 'open' },
			found({ title: 'Theirs', status: 'open' })
		);
		expect(rebaseConflictedWrite(entries, firstId, rebase)).toBe(entries);
	});
	it('keeps an edit for review when the server deleted the resource', () => {
		const entries = conflicted(
			{ title: 'Draft', status: 'done' },
			{ kind: 'conflict', remote: { kind: 'deleted', etag: syncEtag(2n) } }
		);
		expect(rebaseConflictedWrite(entries, firstId, rebase)).toBe(entries);
	});
	it('replays later local edits to the same resource onto the rebased edit', () => {
		const entries = appendWrite(
			conflicted({ title: 'Draft', status: 'done' }, renamed),
			{ ...draft(thirdId, { title: 'Draft', status: 'open' }), basedOn: firstId },
			2
		);
		expect(rebaseConflictedWrite(entries, firstId, rebase)[1].intent.local).toEqual({
			title: 'Renamed',
			status: 'open'
		});
	});
});
