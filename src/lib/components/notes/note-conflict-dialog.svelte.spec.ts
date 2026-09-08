import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { Note } from '$lib/models/notes';
import type { WriteConflictView } from '$lib/models/outbox';
import NoteConflictDialog from './note-conflict-dialog.svelte';

const conflictRecord = (): WriteConflictView<Note> => {
	const base = noteBuilder({ plainText: 'Base' });
	const remote = noteBuilder({ currentRevision: 2, plainText: 'Remote' });
	return {
		base,
		local: { ...base, plainText: 'Local' },
		remote: { kind: 'found', value: remote }
	};
};

describe('Note conflict comparison', () => {
	it('announces that the note changed elsewhere', async () => {
		const screen = await render(NoteConflictDialog, {
			open: true,
			record: conflictRecord(),
			onUseRemote: async () => undefined,
			onKeepLocal: async () => undefined
		});
		await expect
			.element(screen.getByRole('heading', { name: 'This note changed somewhere else' }))
			.toBeVisible();
		await screen.getByRole('button', { name: 'Review later' }).click();
	});

	it('offers both safe resolution choices', async () => {
		const screen = await render(NoteConflictDialog, {
			open: true,
			record: conflictRecord(),
			onUseRemote: async () => undefined,
			onKeepLocal: async () => undefined
		});
		await expect.element(screen.getByRole('button', { name: 'Keep mine' })).toBeVisible();
		await screen.getByRole('button', { name: 'Review later' }).click();
	});
});

describe('failed conflict decisions', () => {
	it('keeps the comparison open and displays a failed resolution', async () => {
		const screen = await render(NoteConflictDialog, {
			open: true,
			record: conflictRecord(),
			onUseRemote: async () => undefined,
			onKeepLocal: async () => {
				throw new Error('Device storage is unavailable');
			}
		});
		await screen.getByRole('button', { name: 'Keep mine' }).click();
		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Device storage is unavailable');
		await screen.getByRole('button', { name: 'Review later' }).click();
	});
	it('does not offer to overwrite a server-deleted note', async () => {
		const screen = await render(NoteConflictDialog, {
			open: true,
			record: { ...conflictRecord(), remote: { kind: 'deleted' } },
			onUseRemote: async () => undefined,
			onKeepLocal: async () => undefined
		});
		await expect.element(screen.getByRole('button', { name: 'Keep mine' })).toBeDisabled();
		await screen.getByRole('button', { name: 'Review later' }).click();
	});
});
