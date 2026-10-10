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
	checksumSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
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
		checksumSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
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
		let initiation: Parameters<AttachmentUploadTransport['initiate']>[0] | undefined;
		let put: { readonly target: string; readonly bytes: Uint8Array } | undefined;
		let completedUploadId: string | undefined;
		const recording = transport({
			initiate: async (input) => {
				initiation = input;
				return { upload, uploadUrl: 'http://127.0.0.1:9/put', requiredHeaders: {} };
			},
			put: async (intent, body) => {
				put = {
					target: intent.uploadUrl,
					bytes: new Uint8Array(await new Response(body).arrayBuffer())
				};
				return new Response('', { status: 200 });
			},
			complete: async (uploadId) => {
				completedUploadId = uploadId;
				return completed;
			}
		});

		const result = await uploadNoteAttachment(noteId, file, recording);
		expect({
			initiation,
			put: put && { target: put.target, bytes: [...put.bytes] },
			completedUploadId,
			result
		}).toEqual({
			initiation: {
				noteId,
				path: expect.stringMatching(/^inline\/.+\/draft\.png$/),
				mediaType: 'image/png',
				byteSize: file.size,
				checksumSha256: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
			},
			put: {
				target: 'http://127.0.0.1:9/put',
				bytes: [104, 101, 108, 108, 111]
			},
			completedUploadId: upload.id,
			result: `/api/attachments/${attachment.id}/content`
		});
	});

	it('gives repeated clipboard filenames independent attachment paths', async () => {
		const paths: string[] = [];
		const recording = transport({
			initiate: async (input) => {
				paths.push(input.path);
				return { upload, uploadUrl: 'http://127.0.0.1:9/put', requiredHeaders: {} };
			}
		});
		await uploadNoteAttachment(noteId, file, recording);
		await uploadNoteAttachment(noteId, file, recording);
		expect(new Set(paths).size).toBe(2);
	});

	it('keeps the original filename in the inline attachment path', async () => {
		let path = '';
		const recording = transport({
			initiate: async (input) => {
				path = input.path;
				return { upload, uploadUrl: 'http://127.0.0.1:9/put', requiredHeaders: {} };
			}
		});
		await uploadNoteAttachment(noteId, file, recording);
		expect(path.endsWith('/draft.png')).toBe(true);
	});

	it('derives a filename for an unnamed clipboard image', async () => {
		let path = '';
		const unnamed = new File(['hello'], '', { type: 'image/jpeg' });
		const recording = transport({
			initiate: async (input) => {
				path = input.path;
				return { upload, uploadUrl: 'http://127.0.0.1:9/put', requiredHeaders: {} };
			}
		});
		await uploadNoteAttachment(noteId, unnamed, recording);
		expect(path.endsWith('/pasted-image.jpg')).toBe(true);
	});

	it('propagates an object-storage rejection with the S3 message', async () => {
		const failing = transport({
			put: async () =>
				new Response('<Error><Message>Bucket full</Message></Error>', { status: 403 })
		});
		await expect(uploadNoteAttachment(noteId, file, failing)).rejects.toThrow(
			'File storage rejected the image: Bucket full'
		);
	});

	it('propagates an object-storage rejection without an XML body', async () => {
		const failing = transport({ put: async () => new Response('', { status: 403 }) });
		await expect(uploadNoteAttachment(noteId, file, failing)).rejects.toThrow(
			'File storage rejected the image (403)'
		);
	});
});
