import type {
	AttachmentFileDetails,
	AttachmentUploadOwner,
	AttachmentUploadDraft
} from '$lib/models/attachments';
type PreparedUpload = AttachmentUploadDraft;
export interface AttachmentUploadPreparation {
	attachment(owner: AttachmentUploadOwner, file: AttachmentFileDetails): PreparedUpload;
	inline(noteId: string, file: AttachmentFileDetails, identity: string): PreparedUpload;
	screenshot(
		todoId: string,
		projectId: string,
		file: AttachmentFileDetails,
		timestamp: number
	): PreparedUpload;
}
const pastedImageName = (file: AttachmentFileDetails): string => {
	if (file.name.trim()) return file.name;
	if (file.mediaType === 'image/jpeg') return 'pasted-image.jpg';
	if (file.mediaType === 'image/webp') return 'pasted-image.webp';
	if (file.mediaType === 'image/gif') return 'pasted-image.gif';
	return 'pasted-image.png';
};
/** Attachment replacement, inline images and todo screenshots keep distinct path identities. */
export class AttachmentUploadService implements AttachmentUploadPreparation {
	attachment(owner: AttachmentUploadOwner, file: AttachmentFileDetails): PreparedUpload {
		return {
			...(owner.kind === 'note' ? { noteId: owner.id } : { projectId: owner.id }),
			path: file.name,
			mediaType: file.mediaType || 'application/octet-stream',
			byteSize: file.byteSize
		};
	}
	inline(noteId: string, file: AttachmentFileDetails, identity: string): PreparedUpload {
		return {
			noteId,
			path: `inline/${identity}/${pastedImageName(file)}`,
			mediaType: file.mediaType || 'image/png',
			byteSize: file.byteSize
		};
	}
	screenshot(
		todoId: string,
		projectId: string,
		file: AttachmentFileDetails,
		timestamp: number
	): PreparedUpload {
		return {
			projectId,
			path: `todos/${todoId}/${timestamp}-${file.name || 'screenshot.png'}`,
			mediaType: file.mediaType || 'image/png',
			byteSize: file.byteSize
		};
	}
}
