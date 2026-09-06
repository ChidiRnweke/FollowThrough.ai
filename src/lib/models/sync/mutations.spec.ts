import { describe, expect, it } from 'vitest';
import {
	acknowledgeMutation,
	beginMutation,
	conflictMutation,
	keepLocalMutation,
	retryMutation,
	stageMutation,
	syncEtag,
	type LocalChange
} from './index';

const change: LocalChange<string> = {
	operationId: 'edit-one',
	generation: 1,
	base: { etag: syncEtag(1n), value: 'Original' },
	local: 'My edit'
};
const sending = () => beginMutation(stageMutation({ kind: 'clean' }, change));
const later: LocalChange<string> = {
	...change,
	operationId: 'edit-two',
	generation: 2,
	local: 'More typing'
};
const server = { etag: syncEtag(2n), value: 'My edit' };

describe('durable local mutation lifecycle', () => {
	it('acknowledges the saved local version', () => {
		expect(acknowledgeMutation(sending(), 'edit-one', server)).toEqual({ kind: 'clean' });
	});

	it('preserves typing after the sent edit is acknowledged', () => {
		const latest = stageMutation(sending(), later);
		const rebased = { ...later, base: server };
		expect(acknowledgeMutation(latest, 'edit-one', server)).toEqual({
			kind: 'pending',
			change: rebased,
			next: rebased
		});
	});

	it('retries the exact sent operation without losing newer local typing', () => {
		const latest = stageMutation(sending(), later);
		expect(beginMutation(retryMutation(latest))).toEqual({
			kind: 'sending',
			change: later,
			sent: change
		});
	});

	it('ignores acknowledgments belonging to a different operation', () => {
		expect(acknowledgeMutation(sending(), 'unrelated', server)).toEqual(sending());
	});

	it('preserves base local and server copies when an edit conflicts', () => {
		const remote = { etag: syncEtag(3n), value: 'Another device' };
		expect(conflictMutation(stageMutation(sending(), later), 'edit-one', remote)).toEqual({
			kind: 'conflict',
			change: later,
			remote
		});
	});

	it('keeps an unresolved conflict when the user continues typing', () => {
		const remote = { etag: syncEtag(3n), value: 'Another device' };
		expect(stageMutation(conflictMutation(sending(), 'edit-one', remote), later)).toEqual({
			kind: 'conflict',
			change: later,
			remote
		});
	});

	it('requires an explicit new operation when retaining the local version', () => {
		const remote = { etag: syncEtag(3n), value: 'Another device' };
		const resolved = { ...change, operationId: 'resolution', generation: 2, base: remote };
		expect(
			keepLocalMutation(conflictMutation(sending(), 'edit-one', remote), 'resolution')
		).toEqual({
			kind: 'pending',
			change: resolved,
			next: resolved
		});
	});

	it('does not silently recreate a remotely deleted record', () => {
		expect(() =>
			keepLocalMutation(conflictMutation(sending(), 'edit-one', null), 'resolution')
		).toThrow('A deleted record must be explicitly recreated');
	});

	it('refuses an obsolete local edit rather than overwriting another tab', () => {
		expect(() => stageMutation(stageMutation(sending(), later), change)).toThrow(
			'A concurrent local edit must be reconciled'
		);
	});
});
