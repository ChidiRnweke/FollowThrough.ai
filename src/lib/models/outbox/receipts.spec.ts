import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import {
	appendWrite,
	acknowledgeWrite,
	beginWrite,
	retainWriteReceipt,
	type WriteDraft,
	type WriteReceipt
} from './index';

const firstId = '10000000-0000-4000-8000-000000000001';
const secondId = '10000000-0000-4000-8000-000000000002';
const original = { etag: syncEtag(1n), value: 'Original' };
const receipt: WriteReceipt<string> = {
	operationId: firstId,
	resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: 'Normalized by server' } }
};
const draft = (): WriteDraft<string, string> => ({
	operationId: secondId,
	key: 'note:1',
	command: 'save',
	base: original,
	basedOn: firstId,
	local: 'Later typing',
	coalesce: null,
	references: []
});

describe('exact acknowledgement ancestry', () => {
	it('uses the acknowledged snapshot for a late descendant without comparing content', () => {
		expect(appendWrite([], draft(), 2, receipt)[0].intent.base).toEqual(
			receipt.resource.kind === 'found' ? receipt.resource.snapshot : null
		);
	});
	it('retains the observed base when a different operation was acknowledged', () => {
		expect(
			appendWrite([], draft(), 2, {
				...receipt,
				operationId: '10000000-0000-4000-8000-000000000003'
			})[0].intent.base
		).toEqual(original);
	});
	it('does not adopt a receipt for an independently opened editor', () => {
		expect(appendWrite([], { ...draft(), basedOn: null }, 2, receipt)[0].intent.base).toEqual(
			original
		);
	});
	it('does not infer success from a missing predecessor', () => {
		expect(appendWrite([], draft(), 2)[0].intent.base).toEqual(original);
	});
	it('preserves a late edit as a conflict after its predecessor deleted the resource', () => {
		const remote = { kind: 'deleted' as const, etag: syncEtag(2n) };
		expect(
			appendWrite([], draft(), 2, { operationId: firstId, resource: remote })[0].delivery
		).toEqual({ kind: 'conflict', remote });
	});
	it('preserves an already queued edit when its predecessor deletes the resource', () => {
		const parent = beginWrite(
			appendWrite([], { ...draft(), operationId: firstId, basedOn: null, local: null }, 1)[0]
		);
		const entries = appendWrite([parent], draft(), 2);
		const remote = { kind: 'deleted' as const, etag: syncEtag(2n) };
		expect(
			acknowledgeWrite(entries, { operationId: firstId, resource: remote })[0].delivery
		).toEqual({ kind: 'conflict', remote });
	});
	it('does not let an older replay replace a newer retained proof', () => {
		const newer: WriteReceipt<string> = {
			operationId: secondId,
			resource: { kind: 'found', snapshot: { etag: syncEtag(3n), value: 'Newer' } }
		};
		expect(retainWriteReceipt(newer, receipt)).toEqual(newer);
	});
});

it('retains the existing proof when a replay has the same version', () => {
	expect(retainWriteReceipt(receipt, { ...receipt, operationId: secondId })).toEqual(receipt);
});
