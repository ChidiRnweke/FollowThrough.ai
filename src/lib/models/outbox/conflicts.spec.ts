import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { retryConflictedWrite, type OutboxEntry } from './index';

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
