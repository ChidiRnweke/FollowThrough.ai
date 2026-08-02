import type { NoteId } from '$lib/models/notes';
import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
import {
	completeAttachmentUpload,
	initiateAttachmentUpload
} from '$lib/remote/attachments/attachments.remote';

type InitiateInput = Parameters<typeof initiateAttachmentUpload>[0];
type InitiateOutput = Awaited<ReturnType<typeof initiateAttachmentUpload>>;
type CompleteOutput = Awaited<ReturnType<typeof completeAttachmentUpload>>;

export interface AttachmentUploadTransport {
	initiate(input: InitiateInput): Promise<InitiateOutput>;
	put(intent: InitiateOutput, body: BodyInit): Promise<Response>;
	complete(uploadId: string): Promise<CompleteOutput>;
}

const liveTransport: AttachmentUploadTransport = {
	initiate: initiateAttachmentUpload,
	put: (intent, body) =>
		fetch(intent.uploadUrl, {
			method: 'PUT',
			headers: intent.requiredHeaders,
			body
		}),
	complete: (uploadId) => completeAttachmentUpload({ uploadId })
};

/** Uploads editor media and returns the stable application-owned content URL. */
export const uploadNoteAttachment = async (
	noteId: NoteId,
	file: File,
	transport: AttachmentUploadTransport = liveTransport
): Promise<string> => {
	const intent = await transport.initiate({
		noteId,
		path: file.name || `pasted-${Date.now()}.png`,
		mediaType: file.type || 'image/png',
		byteSize: file.size,
		checksumSha256: await fileChecksumSha256(file)
	});
	const stored = await transport.put(intent, file);
	if (!stored.ok) {
		const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
		throw new Error(
			detail
				? `Object storage rejected the upload: ${detail}`
				: `Object storage rejected the upload (${stored.status})`
		);
	}
	const uploaded = await transport.complete(intent.upload.id);
	return `/api/attachments/${uploaded.attachment.id}/content`;
};
