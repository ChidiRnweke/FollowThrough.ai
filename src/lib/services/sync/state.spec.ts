import { OutboxEditingService, OutboxDeliveryService } from '$lib/services/sync/state';
import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { type OutboxEntry, type WriteDraft } from '$lib/models/outbox';
const editing = new OutboxEditingService();
const delivery = new OutboxDeliveryService();

const firstId = 'a0000000-0000-4000-8000-000000000001';
const secondId = 'a0000000-0000-4000-8000-000000000002';
const thirdId = 'a0000000-0000-4000-8000-000000000003';
const base = { etag: syncEtag(1n), value: 'Original' };
const draft = (
	operationId: string,
	local: string,
	basedOn: string | null = null
): WriteDraft<string, string> => ({
	operationId,
	key: 'notes:1',
	command: local,
	base,
	basedOn,
	local,
	coalesce: 'document',
	references: []
});
const queued = () => editing.append([], draft(firstId, 'First edit'), 1);
const sending = () => queued().map(delivery.begin);

describe('durable mutation queue rules', () => {
	it('coalesces unsent document edits while retaining their original server base', () => {
		const entries = editing.append(queued(), draft(secondId, 'More typing', firstId), 2);
		expect(entries.map((entry) => entry.intent)).toEqual([
			{
				operationId: secondId,
				key: 'notes:1',
				command: 'More typing',
				base,
				basedOn: null,
				local: 'More typing',
				coalesce: 'document',
				dependencies: []
			}
		]);
	});

	it('preserves dependency order when a later edit refers back to a dependent object', () => {
		const dependent = editing.append(
			queued(),
			{ ...draft(secondId, 'Related'), key: 'notes:2', references: ['notes:1'] },
			2
		);
		const entries = editing.append(
			dependent,
			{ ...draft(thirdId, 'More typing', firstId), references: ['notes:2'] },
			3
		);
		expect(entries.map((entry) => entry.intent.dependencies)).toEqual([
			[],
			[firstId],
			[firstId, secondId]
		]);
	});

	it('preserves a competing tab’s edit instead of coalescing it over another local edit', () => {
		const entries = editing.append(queued(), draft(secondId, 'Competing edit'), 2);
		expect(entries.map((entry) => entry.intent.command)).toEqual(['First edit', 'Competing edit']);
	});

	it('keeps the submitted input immutable when typing continues during a send', () => {
		const entries = editing.append(sending(), draft(secondId, 'More typing', firstId), 2);
		expect(entries.map((entry) => [entry.intent.command, entry.intent.dependencies])).toEqual([
			['First edit', []],
			['More typing', [firstId]]
		]);
	});

	it('never rewrites the input of an operation that may already have reached the server', () => {
		const retry = sending().map((entry) => delivery.fail(entry, 'Connection lost'));
		const entries = editing.append(retry, draft(secondId, 'More typing', firstId), 2);
		expect(delivery.next(entries)?.intent.command).toBe('First edit');
	});

	it('does not coalesce document edits across a publication operation', () => {
		const published = editing.append(
			queued(),
			{ ...draft(secondId, 'Publish'), coalesce: null },
			2
		);
		const entries = editing.append(published, draft(thirdId, 'Unpublished typing'), 3);
		expect(entries.map((entry) => entry.intent.command)).toEqual([
			'First edit',
			'Publish',
			'Unpublished typing'
		]);
	});

	it('rebases the next dependent edit only after the preceding operation is acknowledged', () => {
		const entries = editing.append(sending(), draft(secondId, 'More typing', firstId), 2);
		const snapshot = { etag: syncEtag(2n), value: 'First edit' };
		const next = delivery.settle(entries, firstId, {
			kind: 'applied',
			receipt: {
				operationId: firstId,
				resource: { kind: 'found', snapshot }
			}
		});
		expect(delivery.next(next)?.intent).toEqual({
			...entries[1].intent,
			base: snapshot,
			basedOn: null,
			dependencies: []
		});
	});

	it('keeps unrelated objects sendable when one object has an unresolved conflict', () => {
		const conflicted: OutboxEntry<string, string> = {
			...queued()[0],
			delivery: { kind: 'conflict', remote: { kind: 'found', snapshot: base } }
		};
		const dependent = editing.append([conflicted], draft(secondId, 'Further edit'), 2);
		const entries = editing.append(
			dependent,
			{ ...draft(thirdId, 'Other note'), key: 'notes:2' },
			3
		);
		expect(delivery.next(entries)?.intent.operationId).toBe(thirdId);
	});

	it('waits for a locally created parent before sending a resource that references it', () => {
		const parent = editing.append(
			[],
			{
				...draft(firstId, 'New project'),
				key: 'projects:1',
				base: null,
				basedOn: null,
				coalesce: null
			},
			1
		);
		const entries = editing.append(
			parent,
			{ ...draft(secondId, 'New note'), base: null, basedOn: null, references: ['projects:1'] },
			2
		);
		expect(entries[1].intent.dependencies).toEqual([firstId]);
	});

	it('does not rebase an independent edit merely because it was queued later', () => {
		const entries = editing.append(sending(), draft(secondId, 'Competing edit'), 2);
		const next = delivery.settle(entries, firstId, {
			kind: 'applied',
			receipt: {
				operationId: firstId,
				resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: 'First edit' } }
			}
		});
		expect(delivery.next(next)?.intent.base).toEqual(base);
	});

	it('treats a repeated acknowledgement as already completed', () => {
		expect(
			delivery.settle([], firstId, {
				kind: 'applied',
				receipt: { operationId: firstId, resource: { kind: 'found', snapshot: base } }
			})
		).toEqual([]);
	});
});

it('sends a corrected document after a definitive rejection with a new operation identity', () => {
	const rejected = delivery.settle(sending(), firstId, {
		kind: 'rejected',
		message: 'Invalid document'
	});
	const corrected = editing.append(rejected, draft(secondId, 'Corrected document', firstId), 2);
	expect(delivery.next(corrected)?.intent).toEqual({
		operationId: secondId,
		key: 'notes:1',
		command: 'Corrected document',
		base,
		basedOn: null,
		local: 'Corrected document',
		coalesce: 'document',
		dependencies: []
	});
});

it('retains a rejected document when another queued edit still depends on it', () => {
	const rejected = delivery.settle(sending(), firstId, {
		kind: 'rejected',
		message: 'Invalid document'
	});
	const dependent = editing.append(
		rejected,
		{ ...draft(secondId, 'Reference'), key: 'notes:2', references: ['notes:1'] },
		2
	);
	const corrected = editing.append(dependent, draft(thirdId, 'Corrected document', firstId), 3);
	expect(corrected.map((entry) => entry.intent.operationId)).toEqual([firstId, secondId, thirdId]);
});
