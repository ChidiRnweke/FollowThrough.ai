import type { AttachmentTextReader } from '$lib/server/controllers/attachment-processing/controller';
export class TextAttachmentReader implements AttachmentTextReader {
	readonly kind = 'text';
	async parse(bytes: Uint8Array): Promise<string> {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	}
}
