type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type AttachmentId = Brand<string, 'AttachmentId'>;

export type AttachmentVersionId = Brand<string, 'AttachmentVersionId'>;

export type AttachmentUploadId = Brand<string, 'AttachmentUploadId'>;

type TemplateId = Brand<string, 'TemplateId'>;

type DateTime = Brand<string, 'DateTime'>;

export type ContentHash = Brand<string, 'ContentHash'>;

/**
 * A file attached to a project or a note. Identity is separate from content: an
 * attachment always points at a `currentVersionId`, so re-uploading a replacement
 * (via a new version) never breaks links that already reference this attachment.
 */
export interface Attachment {
	readonly id: AttachmentId;
	readonly projectId: ProjectId;
	readonly noteId?: NoteId;
	readonly path: string;
	readonly currentVersionId: AttachmentVersionId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/**
 * One stored object and what was extracted from it. `processingStatus` is the
 * only place the extraction pipeline's progress is observable; `extractedText`
 * is what indexing and the agent's `read_attachment` tool both read from.
 */
export interface AttachmentVersion {
	readonly id: AttachmentVersionId;
	readonly attachmentId: AttachmentId;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
	readonly parserKind?: string;
	readonly extractedText?: string;
	readonly processingStatus:
		'queued' | 'processing' | 'ready' | 'partial' | 'unsupported' | 'failed';
	readonly processingFailure?: string;
	readonly processedAt?: DateTime;
	readonly createdAt: DateTime;
}

/**
 * A pre-bytes reservation created before the client uploads anything. Nothing
 * about the eventual attachment is visible to other readers until `complete`
 * promotes it; `expiresAt` is what lets an abandoned upload be swept later.
 */
export interface AttachmentUpload {
	readonly id: AttachmentUploadId;
	readonly projectId: ProjectId;
	readonly noteId?: NoteId;
	readonly path: string;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
	readonly expiresAt: DateTime;
	readonly createdAt: DateTime;
}

export interface AttachmentView {
	readonly attachment: Attachment;
	readonly version: AttachmentVersion;
}

export interface InitiateTemplateUploadInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly checksumSha256: string;
}

export interface InitiateTemplateUploadOutput {
	readonly templateId: TemplateId;
	readonly uploadUrl: string;
	readonly requiredHeaders: Record<string, string>;
}
