import { describe, expect, it } from 'vitest';
import { uploadNoteAttachment, type AttachmentUploadTransport } from './attachment-upload';
import type { NoteId } from '$lib/models/notes';
import type {
	Attachment,
	AttachmentUpload,
	AttachmentView,
	AttachmentVersionId
} from '$lib/models/attachments';
import type { ProjectId } from '$lib/models/projects';

const noteId = '00000000-0000-4000-8000-000000000001' as NoteId;
const projectId = '10000000-0000-4000-8000-000000000001' as ProjectId;
const file = new File(['hello'], 'draft.png', { type: 'image/png' });

const upload: AttachmentUpload = {
	id: '20000000-0000-4000-8000-000000000001' as AttachmentUpload['id'],
	projectId,
	path: 'draft.png',
	objectKey: 'attachments/draft.png',
	mediaType: 'image/png',
	byteSize: file.size,
	checksumSha256: 'a'.repeat(64),
	expiresAt: '2026-07-12T08:00:00.000Z' as AttachmentUpload['expiresAt'],
	createdAt: '2026-07-12T08:00:00.000Z' as AttachmentUpload['createdAt']
};

const attachment: Attachment = {
	id: '30000000-0000-4000-8000-000000000001' as Attachment['id'],
	projectId,
	path: 'draft.png',
	currentVersionId: '40000000-0000-4000-8000-000000000001' as AttachmentVersionId,
	createdAt: '2026-07-12T08:00:00.000Z' as Attachment['createdAt'],
	updatedAt: '2026-07-12T08:00:00.000Z' as Attachment['updatedAt']
};

const completed: AttachmentView = {
	attachment,
	version: {
		id: attachment.currentVersionId,
		attachmentId: attachment.id,
		objectKey: 'attachments/draft.png',
		mediaType: 'image/png',
		byteSize: file.size,
		checksumSha256: 'a'.repeat(64),
		processingStatus: 'ready',
		createdAt: '2026-07-12T08:00:00.000Z' as AttachmentView['version']['createdAt']
	}
};

const transport = (
	overrides: Partial<AttachmentUploadTransport> = {}
): AttachmentUploadTransport => ({
	initiate: async () => ({
		upload,
		uploadUrl: 'http://127.0.0.1:9/put',
		requiredHeaders: {}
	}),
	put: async () => new Response('', { status: 200 }),
	complete: async () => completed,
	...overrides
});

describe('uploadNoteAttachment', () => {
	it('returns the stable content URL after a successful upload', async () => {
		const result = await uploadNoteAttachment(noteId, file, transport());
		expect(result).toBe(`/api/attachments/${attachment.id}/content`);
	});

	it('propagates an object-storage rejection with the S3 message', async () => {
		const failing = transport({
			put: async () =>
				new Response('<Error><Message>Bucket full</Message></Error>', { status: 403 })
		});
		await expect(uploadNoteAttachment(noteId, file, failing)).rejects.toThrow(
			'Object storage rejected the upload: Bucket full'
		);
	});

	it('propagates an object-storage rejection without an XML body', async () => {
		const failing = transport({ put: async () => new Response('', { status: 403 }) });
		await expect(uploadNoteAttachment(noteId, file, failing)).rejects.toThrow(
			'Object storage rejected the upload (403)'
		);
	});
});
