import type { RecognizedContent } from '$lib/models/attachments/ocr';
import type { DocumentImageDescription, DocumentContentSlot } from '$lib/models/attachments/ocr';
import { ValidationError } from '$lib/errors';

/** Reading order and Markdown presentation; provider calls belong to the controller. */
export class AttachmentContent {
	plan(parts: readonly RecognizedContent[]): readonly DocumentContentSlot[] {
		let index = 0;
		let precedingMarkdown: string | undefined;
		return parts.map((part) => {
			if (part.kind === 'markdown') {
				const text = part.text.trim();
				if (text) precedingMarkdown = text;
				return { kind: 'markdown', text };
			}
			return {
				kind: 'image',
				imageDataUrl: part.dataUrl,
				index: ++index,
				...(precedingMarkdown ? { context: precedingMarkdown.slice(-1000) } : {})
			};
		});
	}

	render(
		slots: readonly DocumentContentSlot[],
		descriptions: ReadonlyMap<number, DocumentImageDescription>
	): string {
		return slots
			.map((slot) => {
				if (slot.kind === 'markdown') return slot.text;
				const result = descriptions.get(slot.index);
				if (!result)
					throw new ValidationError(`Missing description result for image ${slot.index}`);
				return `> **Image ${slot.index}:** ${result.kind === 'described' ? result.text : '(description unavailable)'}`;
			})
			.filter(Boolean)
			.join('\n\n');
	}
}
