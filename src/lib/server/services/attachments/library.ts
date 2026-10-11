import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentVersion,
	StoredObjectInfo,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentVersionId,
	AttachmentView,
	RemoveAttachmentResult
} from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId, ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { AttachmentRepository } from '$lib/server/repositories/attachments/attachments';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';

/** Only an embedded image claims this endpoint; prose mentioning it does not. */
const documentReferencesAttachment = (
	document: ProseMirrorDocument,
	attachmentId: AttachmentId
): boolean => {
	const expectedSource = `/api/attachments/${attachmentId}/content`;
	const references = (node: ProseMirrorNode): boolean =>
		(node.type === 'image' && node.attrs?.src === expectedSource) ||
		('content' in node && (node.content ?? []).some(references));
	return (document.content ?? []).some(references);
};

const validateAttachmentPath = (value: string): string => {
	const path = value.trim().replaceAll('\\', '/');
	if (
		!path ||
		path.startsWith('/') ||
		path.split('/').some((segment) => !segment || segment === '.' || segment === '..')
	)
		throw new ValidationError('Attachment path must be a safe relative path');
	return path;
};

const MAX_READ_CHARS = 20_000;
/**
 * The attachment records around an upload. Object storage is a separate provider: the caller
 * signs the upload, inspects and promotes the stored object between these steps.
 */
export interface AttachmentUploads {
	initiate(input: {
		projectId?: ProjectId;
		noteId?: NoteId;
		path: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
	}): Promise<{ upload: AttachmentUpload; requiredHeaders: Record<string, string> }>;
	/** @throws NotFoundError if the upload is unknown or has expired. */
	pending(uploadId: AttachmentUpload['id']): Promise<AttachmentUpload>;
	/**
	 * The version a verified upload becomes, stored under its own key.
	 *
	 * @throws ValidationError if the stored object does not match the declared size and checksum.
	 */
	planVersion(upload: AttachmentUpload, stored: StoredObjectInfo): AttachmentVersion;
	finalize(upload: AttachmentUpload, version: AttachmentVersion): Promise<AttachmentView>;
}
export class AttachmentUploadService implements AttachmentUploads {
	constructor(
		private readonly actor: ActorContext,
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository,
		private readonly now: () => DateTime
	) {}

	async initiate(input: {
		projectId?: ProjectId;
		noteId?: NoteId;
		path: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
	}) {
		if ((input.noteId ? 1 : 0) + (input.projectId ? 1 : 0) !== 1)
			throw new ValidationError('Provide exactly one attachment owner');
		const note = input.noteId ? await this.notes.findById(input.noteId) : undefined;
		if (input.noteId && !note) throw new NotFoundError('Note was not found');
		if (note?.archivedAt) throw new ValidationError('Archived notes cannot receive attachments');
		const projectId = note?.projectId ?? input.projectId!;
		const path = validateAttachmentPath(input.path);
		if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1)
			throw new ValidationError('Attachment size must be a positive safe integer');
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Attachment checksum must be a SHA-256 hex digest');
		const timestamp = this.now();
		const uploadId = crypto.randomUUID() as AttachmentUploadId;
		const objectKey = `staging/${this.actor.userId}/${projectId}/${uploadId}`;
		const upload = await this.attachments.createUpload({
			id: uploadId,
			projectId,
			...(input.noteId ? { noteId: input.noteId } : {}),
			path,
			objectKey,
			mediaType: input.mediaType || 'application/octet-stream',
			byteSize: input.byteSize,
			checksumSha256: input.checksumSha256.toLowerCase(),
			expiresAt: new Date(Date.parse(timestamp) + 10 * 60 * 1000).toISOString() as DateTime,
			createdAt: timestamp
		});
		return {
			upload,
			requiredHeaders: {
				'content-type': upload.mediaType,
				'x-amz-meta-sha256': upload.checksumSha256
			}
		};
	}

	async pending(uploadId: AttachmentUpload['id']): Promise<AttachmentUpload> {
		const upload = await this.attachments.findUpload(uploadId);
		if (!upload || Date.parse(upload.expiresAt) <= Date.parse(this.now()))
			throw new NotFoundError('Attachment upload was not found or has expired');
		return upload;
	}

	planVersion(upload: AttachmentUpload, stored: StoredObjectInfo): AttachmentVersion {
		if (
			stored.byteSize !== upload.byteSize ||
			stored.checksumSha256?.toLowerCase() !== upload.checksumSha256
		)
			throw new ValidationError(
				'Uploaded attachment does not match its declared size and checksum'
			);
		const versionId = crypto.randomUUID() as AttachmentVersionId;
		return {
			id: versionId,
			attachmentId: crypto.randomUUID() as AttachmentId,
			objectKey: `objects/${this.actor.userId}/${upload.projectId}/${versionId}`,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			processingStatus: 'queued',
			createdAt: this.now()
		};
	}

	/**
	 * Completing an upload deliberately leaves the owning note's `currentRevision`
	 * alone. That number is the note document's optimistic-concurrency token: the
	 * editor holds it while a pasted image uploads, so bumping it here made the
	 * editor's next autosave look stale and raised a spurious conflict for every
	 * pasted or dropped image. Attachments live beside the document, not in it.
	 */
	finalize(upload: AttachmentUpload, version: AttachmentVersion): Promise<AttachmentView> {
		return this.attachments.finalize(upload, version);
	}
}

export interface AttachmentLookup {
	get(attachmentId: AttachmentId): Promise<AttachmentView>;
}
export interface AttachmentReader extends AttachmentLookup {
	list(noteId: NoteId): Promise<readonly AttachmentView[]>;
	listForProject(projectId: ProjectId): Promise<readonly AttachmentView[]>;
	listForTodo(todoId: TodoId): Promise<readonly AttachmentView[]>;
	get(attachmentId: AttachmentId): Promise<AttachmentView>;
	/** @throws NotFoundError if no attachment of the note has this path. */
	locate(noteId: NoteId, path: string): Promise<AttachmentView>;
	read(
		noteId: NoteId,
		path: string,
		offset?: number,
		limit?: number
	): Promise<{ text: string; offset: number; nextOffset?: number; parserKind: string }>;
}
export class AttachmentReadingService implements AttachmentReader, AttachmentLookup {
	constructor(private readonly attachments: AttachmentRepository) {}

	list(noteId: NoteId): Promise<readonly AttachmentView[]> {
		return this.attachments.list(noteId);
	}

	listForProject(projectId: ProjectId) {
		return this.attachments.listForProject(projectId);
	}

	listForTodo(todoId: TodoId): Promise<readonly AttachmentView[]> {
		return this.attachments.listForTodo(todoId);
	}

	async get(attachmentId: AttachmentId): Promise<AttachmentView> {
		const found = await this.attachments.findById(attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		return found;
	}

	async locate(noteId: NoteId, path: string): Promise<AttachmentView> {
		const found = await this.attachments.findByPath(noteId, validateAttachmentPath(path));
		if (!found) throw new NotFoundError('Attachment was not found');
		return found;
	}

	async read(noteId: NoteId, path: string, offset = 0, limit = MAX_READ_CHARS) {
		const found = await this.attachments.findByPath(noteId, validateAttachmentPath(path));
		if (!found) throw new NotFoundError('Attachment was not found');
		if (!found.version.parserKind) throw new ValidationError('Attachment has no safe text parser');
		const text = found.version.extractedText ?? '';
		const boundedOffset = Math.max(0, offset);
		const boundedLimit = Math.min(MAX_READ_CHARS, Math.max(1, limit));
		const end = Math.min(text.length, boundedOffset + boundedLimit);
		return {
			text: text.slice(boundedOffset, end),
			offset: boundedOffset,
			...(end < text.length ? { nextOffset: end } : {}),
			parserKind: found.version.parserKind
		};
	}
}

export interface AttachmentLifecycle {
	linkToTodo(attachmentId: AttachmentId, todoId: TodoId): Promise<void>;
	retry(attachmentId: AttachmentId): Promise<AttachmentView>;
	removeById(attachmentId: AttachmentId): Promise<RemoveAttachmentResult>;
	remove(noteId: NoteId, path: string): Promise<AttachmentId | undefined>;
}
export class AttachmentLifecycleService implements AttachmentLifecycle {
	constructor(
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository
	) {}

	linkToTodo(attachmentId: AttachmentId, todoId: TodoId): Promise<void> {
		return this.attachments.linkToTodo(attachmentId, todoId);
	}

	async retry(attachmentId: AttachmentId): Promise<AttachmentView> {
		const found = await this.attachments.findById(attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		if (found.version.processingStatus !== 'failed')
			throw new ValidationError('Only failed attachments can be retried');
		const queued = await this.attachments.updateVersion({
			...found.version,
			processingStatus: 'queued',
			processingFailure: undefined,
			processedAt: undefined
		});
		return queued;
	}

	async removeById(attachmentId: AttachmentId): Promise<RemoveAttachmentResult> {
		const found = await this.attachments.findById(attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		if (found.attachment.noteId) {
			const note = await this.notes.findById(found.attachment.noteId);
			if (!note) throw new NotFoundError('Containing note was not found');
			if (documentReferencesAttachment(note.document, attachmentId))
				return { kind: 'referenced-by-note', note: { id: note.id, title: note.title } };
			await this.attachments.remove(note.id, found.attachment.path);
			return { kind: 'removed' };
		}
		await this.attachments.removeById(attachmentId);
		return { kind: 'removed' };
	}

	async remove(noteId: NoteId, path: string): Promise<AttachmentId | undefined> {
		const validatedPath = validateAttachmentPath(path);
		const found = await this.attachments.findByPath(noteId, validatedPath);
		if (!found) return undefined;
		const result = await this.removeById(found.attachment.id);
		if (result.kind === 'referenced-by-note')
			throw new ValidationError('The note still embeds this attachment. Remove the image first.');
		return found.attachment.id;
	}
}
