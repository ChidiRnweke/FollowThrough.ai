import { expect, it } from 'vitest';
import { createEditorSession } from '$lib/factories/workspace/editor-session';

it('persists later typing before reporting a clean buffer', async () => {
	const session = createEditorSession(() => true);
	const gate = Promise.withResolvers<void>();
	let buffer = 'first';
	const saved: string[] = [];
	session.changed();
	const saving = session.save(
		async () => {
			const value = buffer;
			if (value === 'first') await gate.promise;
			saved.push(value);
			return { kind: 'saved', value };
		},
		() => undefined
	);
	buffer = 'later';
	session.changed();
	gate.resolve();
	await saving;
	expect({ saved, dirty: session.dirty }).toEqual({ saved: ['first', 'later'], dirty: false });
});
it('retains dirty state after persistence fails', async () => {
	const session = createEditorSession(() => true);
	session.changed();
	await session.save(
		async () => ({ kind: 'failure', message: 'Storage unavailable' }),
		() => undefined
	);
	expect({ dirty: session.dirty, failure: session.failure }).toEqual({
		dirty: true,
		failure: 'Storage unavailable'
	});
});
it('invalidates a read guard when typing starts', () => {
	const session = createEditorSession(() => true);
	const current = session.checkpoint();
	session.changed();
	expect(current()).toBe(false);
});
it('does not adopt a save after its account lifetime ends', async () => {
	let active = true;
	const session = createEditorSession(() => active);
	const gate = Promise.withResolvers<void>();
	let visible = 'buffer';
	session.changed();
	const saving = session.save(
		async () => {
			await gate.promise;
			return { kind: 'saved', value: 'old' };
		},
		(value) => {
			visible = value;
		}
	);
	active = false;
	gate.resolve();
	await saving;
	expect(visible).toBe('buffer');
});

it('saves new edits after an explicit replacement invalidates an older save', async () => {
	const session = createEditorSession(() => true);
	const gate = Promise.withResolvers<void>();
	let visible = 'replacement';
	const writes: string[] = [];
	const applied: string[] = [];
	session.changed();
	const old = session.save(
		async () => {
			await gate.promise;
			writes.push('old');
			return { kind: 'saved', value: 'old' };
		},
		(value) => {
			applied.push(value);
			visible = value;
		}
	);
	session.accept();
	session.changed();
	const latest = session.save(
		async () => {
			writes.push('new edit');
			return { kind: 'saved', value: 'new edit' };
		},
		(value) => {
			applied.push(value);
			visible = value;
		}
	);
	gate.resolve();
	await Promise.all([old, latest]);
	expect({ writes, applied, visible, dirty: session.dirty }).toEqual({
		writes: ['old', 'new edit'],
		applied: ['new edit'],
		visible: 'new edit',
		dirty: false
	});
});
