import type { NoteId } from '$lib/models/notes';
import type { AttachmentView } from '$lib/models/attachments';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAttachments as setup } from '$lib/testing/attachments/fixtures/processing';
import {
	view,
	uploadFor,
	UPLOAD_ID,
	ATTACHMENT_ID,
	InMemoryAttachmentRepository
} from '$lib/testing/attachments/fakes/processing';
import {
	noteBuilder,
	testActor,
	testClock,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { ValidationError } from '$lib/errors';
import {
	AttachmentUploadService,
	type AttachmentAdmission
} from '$lib/server/services/attachments/library';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
afterEach(() => vi.unstubAllEnvs());
describe('attachments and the note document revision', () => {
	// `currentRevision` is the document's optimistic-concurrency token. The editor
	// holds it open while a pasted image uploads, so a bump here surfaced to the
	// user as a conflict dialog on a note only they had touched.
	it('leaves the revision alone when an upload completes, so an open editor stays current', async () => {
		const { uploads, repository, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);

		const upload = await uploads.pending(UPLOAD_ID);
		await uploads.finalize(
			upload,
			uploads.planVersion(upload, {
				byteSize: upload.byteSize,
				checksumSha256: upload.checksumSha256,
				etag: '"stored"'
			})
		);

		expect((await notes.findById(note.id))?.currentRevision).toBe(7);
		expect(notes.revisions).toEqual([]);
	});

	it('leaves the revision alone when an attachment is removed', async () => {
		const { lifecycle, notes } = setup();
		const note = noteBuilder({ currentRevision: 7 });
		notes.notes.push(note);

		await lifecycle.remove(note.id, 'pasted-diagram.png');

		expect((await notes.findById(note.id))?.currentRevision).toBe(7);
	});
});

describe('verifying an uploaded object against its reservation', () => {
	const reserved = () => {
		const { uploads, repository, notes } = setup();
		const note = noteBuilder();
		notes.notes.push(note);
		repository.upload = uploadFor(note.id);
		return { uploads, upload: repository.upload };
	};

	it('refuses an object whose storage-computed checksum differs from the reserved digest', () => {
		const { uploads, upload } = reserved();
		expect(() =>
			uploads.planVersion(upload, {
				byteSize: upload.byteSize,
				checksumSha256: 'b'.repeat(64),
				etag: '"stored"'
			})
		).toThrow(
			new ValidationError('Uploaded attachment does not match its declared size and checksum')
		);
	});

	it('refuses an object storage holds no checksum for, even when its size matches', () => {
		const { uploads, upload } = reserved();
		expect(() =>
			uploads.planVersion(upload, { byteSize: upload.byteSize, etag: '"stored"' })
		).toThrow(
			new ValidationError(
				'Storage holds no verified checksum for the uploaded attachment. Upload it again.'
			)
		);
	});
});

describe('upload admission', () => {
	const reserve = (admission: AttachmentAdmission, byteSize: number) =>
		new AttachmentUploadService(
			testActor(),
			new InMemoryAttachmentRepository(),
			new InMemoryNoteRepository(testActor()),
			testClock,
			admission
		).initiate({
			projectId: testProjectId(),
			path: 'quarterly-report.pdf',
			mediaType: 'application/pdf',
			byteSize,
			checksumSha256: 'a'.repeat(64)
		});

	it('refuses a reservation larger than the configured ATTACHMENT_MAX_BYTES', async () => {
		await expect(reserve({ maxBytes: 1_000_000 }, 1_000_001)).rejects.toThrow(
			new ValidationError(
				'The attachment is 1000001 bytes, over the 1000000 byte ATTACHMENT_MAX_BYTES setting.'
			)
		);
	});

	it('admits a reservation of exactly the configured ATTACHMENT_MAX_BYTES', async () => {
		expect((await reserve({ maxBytes: 1_000_000 }, 1_000_000)).byteSize).toBe(1_000_000);
	});

	it('admits any positive size when no ceiling is configured', async () => {
		expect((await reserve({}, 64 * 1024 ** 3)).byteSize).toBe(68_719_476_736);
	});
});

describe('removing an attachment without breaking its containing note', () => {
	const noteAttachment = (noteId: NoteId): AttachmentView => ({
		...view('image/png', 'architecture.png'),
		attachment: { ...view('image/png', 'architecture.png').attachment, noteId }
	});

	it('returns the containing note when its document still embeds the attachment', async () => {
		const { lifecycle, repository, notes } = setup();
		const note = noteBuilder({
			title: 'Solution design',
			document: {
				type: 'doc',
				content: [
					{
						type: 'blockquote',
						content: [
							{ type: 'image', attrs: { src: `/api/attachments/${ATTACHMENT_ID}/content` } }
						]
					}
				]
			}
		});
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);

		const result = await lifecycle.removeById(ATTACHMENT_ID);

		expect(result).toEqual({
			kind: 'referenced-by-note',
			note: { id: note.id, title: 'Solution design' }
		});
	});

	it('allows removal when the attachment endpoint appears only in prose', async () => {
		const { lifecycle, repository, notes } = setup();
		const note = noteBuilder({
			document: {
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: `/api/attachments/${ATTACHMENT_ID}/content` }]
					}
				]
			}
		});
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);
		expect(await lifecycle.removeById(ATTACHMENT_ID)).toEqual({ kind: 'removed' });
	});

	it('keeps a referenced attachment readable', async () => {
		const { reader, lifecycle, repository, notes } = setup();
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
		await lifecycle.removeById(ATTACHMENT_ID);

		expect((await reader.get(ATTACHMENT_ID)).version.objectKey).toBe('objects/doc');
	});

	it('preserves note attachment bytes after the image leaves the current document', async () => {
		const { lifecycle, repository, notes, storage } = setup();
		const note = noteBuilder();
		notes.notes.push(note);
		repository.found = noteAttachment(note.id);

		await lifecycle.removeById(ATTACHMENT_ID);

		expect(storage.objects.has('objects/doc')).toBe(true);
	});

	it('queues project attachment bytes for removal after commit', async () => {
		const { lifecycle, repository, storage } = setup();
		repository.found = view('image/png');

		await lifecycle.removeById(ATTACHMENT_ID);

		expect({
			bytes: storage.objects.has('objects/doc'),
			pending: await repository.listPendingObjectRemovals()
		}).toEqual({ bytes: true, pending: ['objects/doc'] });
	});
});
