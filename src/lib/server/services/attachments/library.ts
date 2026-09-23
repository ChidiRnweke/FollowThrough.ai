import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
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

import type { IAttachmentStorage } from '$lib/server/repositories/attachments/storage';

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

// Read lazily: secrets are hydrated into the environment per request, so a
// module-load-time read would freeze whatever was set before the first hydration.
const maxAttachmentBytes = (): number =>
	Number(process.env.ATTACHMENT_MAX_BYTES ?? 50 * 1024 * 1024);
const MAX_READ_CHARS = 20_000;
const now = (): DateTime => new Date().toISOString() as DateTime;

export class AttachmentLibrary {
	constructor(
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository,
		private readonly storage: IAttachmentStorage
	) {}

	async initiate(
		actor: ActorContext,
		input: {
			projectId?: ProjectId;
			noteId?: NoteId;
			path: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	) {
		if ((input.noteId ? 1 : 0) + (input.projectId ? 1 : 0) !== 1)
			throw new ValidationError('Provide exactly one attachment owner');
		const note = input.noteId ? await this.notes.findById(actor, input.noteId) : undefined;
		if (input.noteId && !note) throw new NotFoundError('Note was not found');
		if (note?.archivedAt) throw new ValidationError('Archived notes cannot receive attachments');
		const projectId = note?.projectId ?? input.projectId!;
		const path = validateAttachmentPath(input.path);
		const maxBytes = maxAttachmentBytes();
		if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > maxBytes)
			throw new ValidationError(`Attachment must be between 1 and ${maxBytes} bytes`);
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Attachment checksum must be a SHA-256 hex digest');
		const timestamp = now();
		const uploadId = crypto.randomUUID() as AttachmentUploadId;
		const objectKey = `staging/${actor.userId}/${projectId}/${uploadId}`;
		const upload = await this.attachments.createUpload(actor, {
			id: uploadId,
			projectId,
			...(input.noteId ? { noteId: input.noteId } : {}),
			path,
			objectKey,
			mediaType: input.mediaType || 'application/octet-stream',
			byteSize: input.byteSize,
			checksumSha256: input.checksumSha256.toLowerCase(),
			expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() as DateTime,
			createdAt: timestamp
		});
		const uploadUrl = await this.storage.createUploadUrl({
			objectKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			expiresInSeconds: 600
		});
		return {
			upload,
			uploadUrl,
			requiredHeaders: {
				'content-type': upload.mediaType,
				'x-amz-meta-sha256': upload.checksumSha256
			}
		};
	}

	/**
	 * Completing an upload deliberately leaves the owning note's `currentRevision`
	 * alone. That number is the note document's optimistic-concurrency token: the
	 * editor holds it while a pasted image uploads, so bumping it here made the
	 * editor's next autosave look stale and raised a spurious conflict for every
	 * pasted or dropped image. Attachments live beside the document, not in it.
	 */
	async complete(actor: ActorContext, uploadId: AttachmentUpload['id']): Promise<AttachmentView> {
		const upload = await this.attachments.findUpload(actor, uploadId);
		if (!upload || new Date(upload.expiresAt).getTime() <= Date.now())
			throw new NotFoundError('Attachment upload was not found or has expired');
		const stored = await this.storage.stat(upload.objectKey);
		if (
			stored.byteSize !== upload.byteSize ||
			stored.checksumSha256?.toLowerCase() !== upload.checksumSha256
		)
			throw new ValidationError(
				'Uploaded attachment does not match its declared size and checksum'
			);
		const timestamp = now();
		const versionId = crypto.randomUUID() as AttachmentVersionId;
		const destinationKey = `objects/${actor.userId}/${upload.projectId}/${versionId}`;
		await this.storage.promote(upload.objectKey, destinationKey);
		const view = await this.attachments.finalize(actor, upload, {
			id: versionId,
			attachmentId: crypto.randomUUID() as AttachmentId,
			objectKey: destinationKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			processingStatus: 'queued',
			createdAt: timestamp
		});
		return view;
	}

	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]> {
		return this.attachments.list(actor, noteId);
	}

	listForProject(actor: ActorContext, projectId: ProjectId) {
		return this.attachments.listForProject(actor, projectId);
	}

	linkToTodo(actor: ActorContext, attachmentId: AttachmentId, todoId: TodoId): Promise<void> {
		return this.attachments.linkToTodo(actor, attachmentId, todoId);
	}

	listForTodo(actor: ActorContext, todoId: TodoId): Promise<readonly AttachmentView[]> {
		return this.attachments.listForTodo(actor, todoId);
	}

	async downloadById(actor: ActorContext, attachmentId: AttachmentId): Promise<{ url: string }> {
		const found = await this.attachments.findById(actor, attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		return { url: await this.storage.createDownloadUrl(found.version.objectKey, 300) };
	}

	async retry(actor: ActorContext, attachmentId: AttachmentId): Promise<AttachmentView> {
		const found = await this.attachments.findById(actor, attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		if (found.version.processingStatus !== 'failed')
			throw new ValidationError('Only failed attachments can be retried');
		const queued = await this.attachments.updateVersion(actor, {
			...found.version,
			processingStatus: 'queued',
			processingFailure: undefined,
			processedAt: undefined
		});
		return queued;
	}

	async removeById(
		actor: ActorContext,
		attachmentId: AttachmentId
	): Promise<RemoveAttachmentResult> {
		const found = await this.attachments.findById(actor, attachmentId);
		if (!found) throw new NotFoundError('Attachment was not found');
		if (found.attachment.noteId) {
			const note = await this.notes.findById(actor, found.attachment.noteId);
			if (!note) throw new NotFoundError('Containing note was not found');
			if (documentReferencesAttachment(note.document, attachmentId))
				return { kind: 'referenced-by-note', note: { id: note.id, title: note.title } };
			await this.attachments.remove(actor, note.id, found.attachment.path);
			return { kind: 'removed' };
		}
		await this.attachments.removeById(actor, attachmentId);
		await this.storage.remove(found.version.objectKey);
		return { kind: 'removed' };
	}

	async download(actor: ActorContext, noteId: NoteId, path: string): Promise<{ url: string }> {
		const found = await this.attachments.findByPath(actor, noteId, validateAttachmentPath(path));
		if (!found) throw new NotFoundError('Attachment was not found');
		return { url: await this.storage.createDownloadUrl(found.version.objectKey, 300) };
	}

	async read(
		actor: ActorContext,
		noteId: NoteId,
		path: string,
		offset = 0,
		limit = MAX_READ_CHARS
	) {
		const found = await this.attachments.findByPath(actor, noteId, validateAttachmentPath(path));
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

	async remove(
		actor: ActorContext,
		noteId: NoteId,
		path: string
	): Promise<AttachmentId | undefined> {
		const validatedPath = validateAttachmentPath(path);
		const found = await this.attachments.findByPath(actor, noteId, validatedPath);
		await this.attachments.remove(actor, noteId, validatedPath);
		if (found) await this.storage.remove(found.version.objectKey);
		return found?.attachment.id;
	}
}
