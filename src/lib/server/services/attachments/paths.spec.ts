import { expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';

it('rejects a traversal path before creating an attachment upload', async () => {
	const { service, notes } = setupAttachments();
	const note = noteBuilder();
	notes.notes.push(note);
	await expect(
		service.initiate(testActor(), {
			noteId: note.id,
			path: '../secret.txt',
			mediaType: 'text/plain',
			byteSize: 1,
			checksumSha256: '0'.repeat(64)
		})
	).rejects.toThrow('safe relative path');
});
