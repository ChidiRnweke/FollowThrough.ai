import { expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

it('rejects a traversal path before creating an attachment upload', async () => {
	const { uploads, notes } = setupAttachments();
	const note = noteBuilder();
	notes.notes.push(note);
	await expect(
		uploads.initiate({
			noteId: note.id,
			path: '../secret.txt',
			mediaType: 'text/plain',
			byteSize: 1,
			checksumSha256: '0'.repeat(64)
		})
	).rejects.toThrow('safe relative path');
});
