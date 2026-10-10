import type { AttachmentVersion } from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import type { ExtractedAttachmentContent } from '$lib/models/attachments/ocr';
import type { RecognizedContent } from '$lib/models/attachments/ocr';
import type { DocumentImageDescription, DocumentContentSlot } from '$lib/models/attachments/ocr';
import { ValidationError } from '$lib/errors';

/** Reading order and Markdown presentation; provider calls belong to the controller. */
export interface AttachmentContentPresentation {
	plan(parts: readonly RecognizedContent[]): readonly DocumentContentSlot[];
	render(
		slots: readonly DocumentContentSlot[],
		descriptions: ReadonlyMap<number, DocumentImageDescription>
	): string;
}
export class AttachmentContent implements AttachmentContentPresentation {
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

// Older indexing marked a fully extracted file partial when its index exceeded fifty chunks.
const savedTruncatedContent = (
	version: AttachmentVersion
): ExtractedAttachmentContent | undefined =>
	version.processingStatus === 'partial' &&
	version.processingFailure === undefined &&
	version.extractedText !== undefined &&
	version.parserKind !== undefined
		? { text: version.extractedText, parserKind: version.parserKind }
		: undefined;
const pendingAttachmentProcessing = (version: AttachmentVersion) =>
	version.processingStatus === 'queued' ||
	version.processingStatus === 'processing' ||
	savedTruncatedContent(version) !== undefined;

const completedAttachmentVersion = (
	version: AttachmentVersion,
	extraction: ExtractedAttachmentContent | undefined,
	timestamp: DateTime
): AttachmentVersion => ({
	...version,
	parserKind: extraction?.parserKind,
	extractedText: extraction?.text,
	processingStatus: !extraction
		? 'unsupported'
		: extraction.processingFailure
			? 'partial'
			: 'ready',
	processingFailure: extraction?.processingFailure,
	processedAt: timestamp
});

export interface AttachmentProcessingRules {
	saved(version: AttachmentVersion): ExtractedAttachmentContent | undefined;
	pending(version: AttachmentVersion): boolean;
	complete(
		version: AttachmentVersion,
		extraction: ExtractedAttachmentContent | undefined,
		timestamp: DateTime
	): AttachmentVersion;
}
export class AttachmentProcessingService implements AttachmentProcessingRules {
	saved(version: AttachmentVersion) {
		return savedTruncatedContent(version);
	}
	pending(version: AttachmentVersion) {
		return pendingAttachmentProcessing(version);
	}
	complete(
		version: AttachmentVersion,
		extraction: ExtractedAttachmentContent | undefined,
		timestamp: DateTime
	) {
		return completedAttachmentVersion(version, extraction, timestamp);
	}
}
