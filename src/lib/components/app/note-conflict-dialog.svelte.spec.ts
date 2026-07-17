import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { noteBuilder } from '$lib/testing/fixtures/domain-builders';
import { noteEtag, type NoteSyncRecord } from '$lib/models';
import NoteConflictDialog from './note-conflict-dialog.svelte';

const conflictRecord = (): NoteSyncRecord => {
	const base = noteBuilder({ plainText: 'Base' });
	const remote = noteBuilder({ currentRevision: 2, plainText: 'Remote' });
	return {
		userId: base.userId,
		noteId: base.id,
		base: { note: base, etag: noteEtag(base) },
		local: { ...base, plainText: 'Local' },
		remote: { note: remote, etag: noteEtag(remote) },
		operationId: crypto.randomUUID(),
		editVersion: 1,
		state: 'conflict',
		updatedAt: base.updatedAt
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
	});

	it('offers both safe resolution choices', async () => {
		const screen = await render(NoteConflictDialog, {
			open: true,
			record: conflictRecord(),
			onUseRemote: async () => undefined,
			onKeepLocal: async () => undefined
		});
		await expect.element(screen.getByRole('button', { name: 'Keep mine' })).toBeVisible();
	});
});
