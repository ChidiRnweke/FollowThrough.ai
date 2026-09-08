import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import {
	appendWrite,
	beginWrite,
	nextWrite,
	unresolvedWrite,
	resolveWriteBase,
	type WriteDraft
} from './index';
const firstId = 'a0000000-0000-4000-8000-000000000001';
const nextId = 'a0000000-0000-4000-8000-000000000002';
const draft: WriteDraft<string, string> = {
	operationId: firstId,
	key: 'note:1',
	command: 'edit',
	base: { etag: null, value: 'Original' },
	basedOn: null,
	local: 'Offline edit',
	coalesce: 'document',
	references: []
};
const imported = () => appendWrite([], draft, 1);
const snapshot = { etag: syncEtag(2n), value: 'Original' };

describe('imported draft bases', () => {
	it('retains an imported draft without treating its unknown validator as a new object', () => {
		expect({
			sendable: nextWrite(imported()),
			base: unresolvedWrite(imported())?.intent.base
		}).toEqual({ sendable: null, base: { etag: null, value: 'Original' } });
	});
	it('refuses submission before the imported base has been checked', () => {
		expect(() => beginWrite(imported()[0])).toThrow();
	});
	it('makes a checked draft sendable without changing its local content', () => {
		expect(
			nextWrite(resolveWriteBase(imported(), firstId, { kind: 'matched', snapshot }))?.intent
		).toEqual({ ...imported()[0].intent, base: snapshot });
	});
	it('retains base and local copies when the checked server value has diverged', () => {
		const remote = {
			kind: 'found' as const,
			snapshot: { etag: syncEtag(3n), value: 'Another client' }
		};
		expect(resolveWriteBase(imported(), firstId, { kind: 'conflict', remote })[0]).toEqual({
			...imported()[0],
			delivery: { kind: 'conflict', remote }
		});
	});
	it('ignores a completed check for unsent input that was replaced while it ran', () => {
		const newer = appendWrite(
			imported(),
			{ ...draft, operationId: nextId, basedOn: firstId, local: 'More typing' },
			2
		);
		expect(resolveWriteBase(newer, firstId, { kind: 'matched', snapshot })).toEqual(newer);
	});
});
