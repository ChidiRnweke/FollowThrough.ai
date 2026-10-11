import { expect, it } from 'vitest';
import { AttachmentUploadService } from './uploads';
const uploads = new AttachmentUploadService();
it('keeps ordinary replacement paths and the existing generic media type', () => {
	expect(
		uploads.attachment(
			{ kind: 'project', id: 'project' },
			{ name: 'brief', mediaType: '', byteSize: 7 }
		)
	).toEqual({
		projectId: 'project',
		path: 'brief',
		mediaType: 'application/octet-stream',
		byteSize: 7
	});
});
it.each([
	['image/jpeg', 'jpg'],
	['image/webp', 'webp'],
	['image/gif', 'gif'],
	['', 'png']
] as const)('names an unnamed inline %s image without sharing its path', (mediaType, extension) => {
	expect(uploads.inline('note', { name: '', mediaType, byteSize: 5 }, 'identity')).toEqual({
		noteId: 'note',
		path: `inline/identity/pasted-image.${extension}`,
		mediaType: mediaType || 'image/png',
		byteSize: 5
	});
});
