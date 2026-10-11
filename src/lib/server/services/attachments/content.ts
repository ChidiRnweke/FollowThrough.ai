import type { AttachmentVersion } from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import type { ExtractedAttachmentContent } from '$lib/models/attachments/ocr';

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
