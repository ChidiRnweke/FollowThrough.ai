import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { discardWrites, dependentWrites, retryConflictedWrite, type OutboxEntry } from './index';

const firstId = 'a0000000-0000-4000-8000-000000000001';
const replacementId = 'a0000000-0000-4000-8000-000000000002';
const remote = { etag: syncEtag(2n), value: 'Another client' };
const conflicted: OutboxEntry<string, string> = {
	sequence: 1,
	intent: {
		operationId: firstId,
		key: 'note:1',
		command: 'My edit',
		base: { etag: syncEtag(1n), value: 'Original' },
		basedOn: null,
		local: 'My edit',
		coalesce: null,
		dependencies: []
	},
	delivery: { kind: 'conflict', remote: { kind: 'found', snapshot: remote } }
};

describe('explicit conflict resolution', () => {
	it('retains the local edit with a new identity guarded against the displayed server version', () => {
		expect(retryConflictedWrite([conflicted], firstId, replacementId)).toEqual([
			{
				...conflicted,
				intent: { ...conflicted.intent, operationId: replacementId, base: remote },
				delivery: { kind: 'queued' }
			}
		]);
	});
	it('does not silently recreate a remotely deleted resource', () => {
		expect(() =>
			retryConflictedWrite(
				[
					{
						...conflicted,
						delivery: { kind: 'conflict', remote: { kind: 'deleted', etag: syncEtag(2n) } }
					}
				],
				firstId,
				replacementId
			)
		).toThrow('must be explicitly recreated');
	});
	it('does not reuse the conflicted operation identity for changed input', () => {
		expect(() => retryConflictedWrite([conflicted], firstId, firstId)).toThrow(
			'requires a new operation identity'
		);
	});
	it('preserves the ancestry of typing that followed the conflicting edit', () => {
		const dependent: OutboxEntry<string, string> = {
			...conflicted,
			sequence: 2,
			intent: {
				...conflicted.intent,
				operationId: 'a0000000-0000-4000-8000-000000000003',
				basedOn: firstId,
				dependencies: [firstId],
				local: 'More typing'
			},
			delivery: { kind: 'queued' }
		};
		expect(retryConflictedWrite([conflicted, dependent], firstId, replacementId)[1].intent).toEqual(
			{ ...dependent.intent, basedOn: replacementId, dependencies: [replacementId] }
		);
	});
});

describe('explicit local edit discard', () => {
	it('removes only the selected reviewed edit', () => {
		const other = {
			...conflicted,
			sequence: 2,
			intent: { ...conflicted.intent, operationId: replacementId, key: 'note:2' }
		};
		expect(discardWrites([conflicted, other], [firstId])).toEqual([other]);
	});
	it('refuses to strand an unselected dependent edit', () => {
		const dependent = {
			...conflicted,
			sequence: 2,
			intent: {
				...conflicted.intent,
				operationId: replacementId,
				dependencies: [firstId],
				basedOn: firstId
			},
			delivery: { kind: 'queued' as const }
		};
		expect(() => discardWrites([conflicted, dependent], [firstId])).toThrow(
			'Review dependent edits'
		);
	});
	it('allows discarding a reviewed conflict and all its unsent descendants together', () => {
		const dependent = {
			...conflicted,
			sequence: 2,
			intent: {
				...conflicted.intent,
				operationId: replacementId,
				dependencies: [firstId],
				basedOn: firstId
			},
			delivery: { kind: 'queued' as const }
		};
		expect(discardWrites([conflicted, dependent], [firstId, replacementId])).toEqual([]);
	});
	it('requires receipt recovery before discarding an attempted write', () => {
		expect(() =>
			discardWrites(
				[{ ...conflicted, delivery: { kind: 'retry', message: 'Connection lost' } }],
				[firstId]
			)
		).toThrow('Check the server receipt');
	});
	it('rejects a stale discard decision after an edit was replaced', () => {
		expect(() => discardWrites([conflicted], [replacementId])).toThrow('review them again');
	});
});

describe('reviewing dependent edits', () => {
	it('includes indirect descendants but leaves independent edits alone', () => {
		const child: OutboxEntry<string, string> = {
			...conflicted,
			sequence: 2,
			intent: {
				...conflicted.intent,
				operationId: 'a0000000-0000-4000-8000-000000000003',
				basedOn: firstId
			},
			delivery: { kind: 'queued' }
		};
		const grandchild: OutboxEntry<string, string> = {
			...child,
			sequence: 3,
			intent: {
				...child.intent,
				operationId: 'a0000000-0000-4000-8000-000000000004',
				basedOn: null,
				dependencies: ['a0000000-0000-4000-8000-000000000003']
			}
		};
		const independent: OutboxEntry<string, string> = {
			...child,
			sequence: 4,
			intent: {
				...child.intent,
				operationId: 'a0000000-0000-4000-8000-000000000005',
				basedOn: null
			}
		};
		expect(
			dependentWrites([grandchild, independent, child, conflicted], firstId).map(
				(entry) => entry.intent.operationId
			)
		).toEqual([
			'a0000000-0000-4000-8000-000000000004',
			'a0000000-0000-4000-8000-000000000003',
			firstId
		]);
	});
});

it('does not turn a conflicting creation into an update of an existing item', () => {
	expect(() =>
		retryConflictedWrite(
			[{ ...conflicted, intent: { ...conflicted.intent, base: null } }],
			firstId,
			replacementId
		)
	).toThrow('retain both copies');
});
