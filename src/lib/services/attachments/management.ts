import type {
	ActorContext,
	AttachmentId,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView,
	DateTime,
	NoteId,
	NoteRevisionId
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type { AttachmentRepository, NoteRepository } from '$lib/repositories';
import type {
	AttachmentParserRegistry,
	AttachmentStorage
} from '$lib/server/domain/attachment-storage';
import { validateAttachmentPath } from '$lib/services/skills/manifest';
import type { AttachmentManager } from './contracts';

const MAX_ATTACHMENT_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 50 * 1024 * 1024);
const MAX_PARSE_BYTES = Number(process.env.ATTACHMENT_PARSE_MAX_BYTES ?? 1024 * 1024);
const MAX_READ_CHARS = 20_000;
const now = (): DateTime => new Date().toISOString() as DateTime;

export class AttachmentManagementService implements AttachmentManager {
	constructor(
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository,
		private readonly storage: AttachmentStorage,
		private readonly parsers: AttachmentParserRegistry
	) {}

	async initiate(
		actor: ActorContext,
		input: {
			noteId: NoteId;
			path: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	) {
		const note = await this.notes.findById(actor, input.noteId);
		if (!note) throw new NotFoundError('Note was not found');
		if (note.archivedAt) throw new ValidationError('Archived notes cannot receive attachments');
		const path = validateAttachmentPath(input.path);
		if (
			!Number.isSafeInteger(input.byteSize) ||
			input.byteSize < 1 ||
			input.byteSize > MAX_ATTACHMENT_BYTES
		)
			throw new ValidationError(`Attachment must be between 1 and ${MAX_ATTACHMENT_BYTES} bytes`);
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Attachment checksum must be a SHA-256 hex digest');
		const timestamp = now();
		const uploadId = crypto.randomUUID() as AttachmentUploadId;
		const objectKey = `staging/${actor.userId}/${input.noteId}/${uploadId}`;
		const upload = await this.attachments.createUpload(actor, {
			id: uploadId,
			noteId: input.noteId,
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
		const parser = this.parsers.select(upload.mediaType, upload.path);
		let extractedText: string | undefined;
		if (parser && upload.byteSize <= MAX_PARSE_BYTES) {
			const bytes = await this.storage.read(upload.objectKey, MAX_PARSE_BYTES);
			extractedText = (await parser.parse(bytes)).slice(0, MAX_PARSE_BYTES);
		}
		const timestamp = now();
		const versionId = crypto.randomUUID() as AttachmentVersionId;
		const destinationKey = `objects/${actor.userId}/${upload.noteId}/${versionId}`;
		await this.storage.promote(upload.objectKey, destinationKey);
		const view = await this.attachments.finalize(actor, upload, {
			id: versionId,
			attachmentId: crypto.randomUUID() as AttachmentId,
			objectKey: destinationKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			...(parser ? { parserKind: parser.kind } : {}),
			...(extractedText !== undefined ? { extractedText } : {}),
			createdAt: timestamp
		});
		await this.recordBundleRevision(actor, upload.noteId);
		return view;
	}

	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]> {
		return this.attachments.list(actor, noteId);
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

	async remove(actor: ActorContext, noteId: NoteId, path: string): Promise<void> {
		await this.attachments.remove(actor, noteId, validateAttachmentPath(path));
		await this.recordBundleRevision(actor, noteId);
	}

	private async recordBundleRevision(actor: ActorContext, noteId: NoteId): Promise<void> {
		const note = await this.notes.findById(actor, noteId);
		if (!note) throw new NotFoundError('Note was not found');
		const timestamp = now();
		const updated = await this.notes.update(actor, {
			...note,
			currentRevision: note.currentRevision + 1,
			updatedAt: timestamp
		});
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId,
			revision: updated.currentRevision,
			title: updated.title,
			document: updated.document,
			plainText: updated.plainText,
			createdAt: timestamp
		});
	}
}
