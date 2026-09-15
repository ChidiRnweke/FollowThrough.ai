import type { NoteId } from '$lib/models/notes';
import type { AttachmentView } from '$lib/models/attachments';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import {
	view,
	uploadFor,
	UPLOAD_ID,
	ATTACHMENT_ID
} from '$lib/testing/attachments/fakes/processing';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
afterEach(() => vi.unstubAllEnvs());
describe('attachments and the note document revision', () => {
	// `currentRevision` is the document's optimistic-concurrency token. The editor
	// holds it open while a pasted image uploads, so a bump here surfaced to the
	// user as a conflict dialog on a note only they had touched.
	it('leaves the revision alone when an upload completes, so an open editor stays current', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);

		await service.complete(testActor(), UPLOAD_ID);

		expect((await notes.findById(testActor(), note.id))?.currentRevision).toBe(7);
	});

	it('writes no note revision snapshot for a completed upload', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder();
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);

		await service.complete(testActor(), UPLOAD_ID);

		expect(notes.revisions).toEqual([]);
	});

	it('leaves the revision alone when an attachment is removed', async () => {
		const { service, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);

		await service.remove(testActor(), note.id, 'pasted-diagram.png');

		expect((await notes.findById(testActor(), note.id))?.currentRevision).toBe(7);
	});
});

describe('removing an attachment without breaking its containing note', () => {
	const noteAttachment = (noteId: NoteId): AttachmentView => ({
		...view('image/png', 'architecture.png'),
		attachment: { ...view('image/png', 'architecture.png').attachment, noteId }
	});

	it('returns the containing note when its document still embeds the attachment', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder({
			title: 'Solution design',
			document: {
				type: 'doc',
				content: [
					{
						type: 'image',
						attrs: { src: `/api/attachments/${ATTACHMENT_ID}/content` }
					}
				]
			}
		});
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);

		const result = await service.removeById(testActor(), ATTACHMENT_ID);

		expect(result).toEqual({
			kind: 'referenced-by-note',
			note: { id: note.id, title: 'Solution design' }
		});
	});

	it('keeps a referenced attachment downloadable', async () => {
		const { service, repository, notes } = setup();
		const note = noteBuilder({
			document: {
				type: 'doc',
				content: [
					{
						type: 'image',
						attrs: { src: `/api/attachments/${ATTACHMENT_ID}/content` }
					}
				]
			}
		});
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);
		await service.removeById(testActor(), ATTACHMENT_ID);

		expect(await service.downloadById(testActor(), ATTACHMENT_ID)).toEqual({
			url: 'https://storage.test/presigned'
		});
	});

	it('preserves note attachment bytes after the image leaves the current document', async () => {
		const { service, repository, notes, storage } = setup();
		const note = noteBuilder();
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);

		await service.removeById(testActor(), ATTACHMENT_ID);

		expect(storage.objects.has('objects/doc')).toBe(true);
	});

	it('deletes project attachment bytes', async () => {
		const { service, repository, storage } = setup();
		repository.found = view('image/png');

		await service.removeById(testActor(), ATTACHMENT_ID);

		expect(storage.objects.has('objects/doc')).toBe(false);
	});
});
