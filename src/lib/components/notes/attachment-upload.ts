import type { NoteId } from '$lib/models/notes';
import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
import {
	completeAttachmentUpload,
	initiateAttachmentUpload
} from '$lib/remote/attachments/attachments.remote';

/** Uploads editor media and returns the stable application-owned content URL. */
export const uploadNoteAttachment = async (noteId: NoteId, file: File): Promise<string> => {
	const intent = await initiateAttachmentUpload({
		noteId,
		path: file.name || `pasted-${Date.now()}.png`,
		mediaType: file.type || 'image/png',
		byteSize: file.size,
		checksumSha256: await fileChecksumSha256(file)
	});
	const stored = await fetch(intent.uploadUrl, {
		method: 'PUT',
		headers: intent.requiredHeaders,
		body: file
	});
	if (!stored.ok) {
		const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
		throw new Error(
			detail
				? `Object storage rejected the upload: ${detail}`
				: `Object storage rejected the upload (${stored.status})`
		);
	}
	const uploaded = await completeAttachmentUpload({ uploadId: intent.upload.id });
	return `/api/attachments/${uploaded.attachment.id}/content`;
};
