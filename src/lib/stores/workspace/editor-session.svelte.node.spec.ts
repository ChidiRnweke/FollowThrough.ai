import { expect, it } from 'vitest';
import { EditorSession } from './editor-session.svelte';

it('persists later typing before reporting a clean buffer', async () => {
	const session = new EditorSession(() => true);
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
	const session = new EditorSession(() => true);
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
	const session = new EditorSession(() => true);
	const current = session.checkpoint();
	session.changed();
	expect(current()).toBe(false);
});
it('does not adopt a pending save after an explicit replacement', async () => {
	const session = new EditorSession(() => true);
	const gate = Promise.withResolvers<void>();
	let visible = 'replacement';
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
	session.accept();
	gate.resolve();
	await saving;
	expect(visible).toBe('replacement');
});
it('does not adopt a save after its account lifetime ends', async () => {
	let active = true;
	const session = new EditorSession(() => active);
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
	const session = new EditorSession(() => true);
	const gate = Promise.withResolvers<void>();
	let visible = 'replacement';
	session.changed();
	const old = session.save(
		async () => {
			await gate.promise;
			return { kind: 'saved', value: 'old' };
		},
		(value) => {
			visible = value;
		}
	);
	session.accept();
	session.changed();
	const latest = session.save(
		async () => ({ kind: 'saved', value: 'new edit' }),
		(value) => {
			visible = value;
		}
	);
	gate.resolve();
	await Promise.all([old, latest]);
	expect({ visible, dirty: session.dirty }).toEqual({ visible: 'new edit', dirty: false });
});
