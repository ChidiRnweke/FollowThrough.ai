import { expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view, ATTACHMENT_ID } from '$lib/testing/attachments/fakes/processing';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = (embedded = false) => {
	const dependencies = setupAttachments();
	const note = noteBuilder({
		document: {
			type: 'doc',
			content: embedded
				? [{ type: 'image', attrs: { src: `/api/attachments/${ATTACHMENT_ID}/content` } }]
				: [{ type: 'paragraph' }]
		}
	});
	dependencies.notes.notes.push(note);
	const attachment = view('image/png', 'architecture.png');
	dependencies.repository.found = {
		...attachment,
		attachment: { ...attachment.attachment, noteId: note.id }
	};
	return { ...dependencies, note, attachment };
};

it('preserves file bytes needed by retained note revisions after path removal', async () => {
	const { lifecycle, storage, note, attachment } = setup();
	await lifecycle.remove(testActor(), note.id, attachment.attachment.path);
	expect(storage.objects.has(attachment.version.objectKey)).toBe(true);
});

it('refuses path removal while the current note still embeds the attachment', async () => {
	const { lifecycle, note, attachment } = setup(true);
	await expect(lifecycle.remove(testActor(), note.id, attachment.attachment.path)).rejects.toThrow(
		'still embeds'
	);
});

it('removes an unreferenced attachment from the current note and returns its indexing identity', async () => {
	const { lifecycle, repository, note, attachment } = setup();
	const removed = await lifecycle.remove(testActor(), note.id, attachment.attachment.path);
	expect({
		removed,
		current: await repository.findByPath(testActor(), note.id, attachment.attachment.path)
	}).toEqual({ removed: attachment.attachment.id, current: undefined });
});
