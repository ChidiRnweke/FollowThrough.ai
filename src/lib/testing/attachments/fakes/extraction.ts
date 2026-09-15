import type { AttachmentView } from '$lib/models/attachments';
import type { AttachmentTextExtractor } from '$lib/server/services/attachments/contracts';
export class InMemoryAttachmentExtraction implements AttachmentTextExtractor {
	beforeExtract: () => Promise<void> = async () => {};
	text = 'Extracted document';
	async extract(_view: AttachmentView, _visionModel: string) {
		await this.beforeExtract();
		return { text: this.text, parserKind: 'text' };
	}
}
