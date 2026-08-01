import type { ActorContext } from '$lib/models/identity';
import type { AgentPreferences } from '$lib/models/agent';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView
} from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId, NoteRevisionId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { AttachmentRepository } from '$lib/server/repositories/attachments/attachments';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { RetrievalIndexRepository } from '$lib/server/repositories/knowledge-search';
import { resolveAttachmentVisionModel } from '$lib/models/agent';
import { isOcrImage, isOcrSupported } from '$lib/models/attachments/formats';

interface AttachmentStorage {
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string>;
	createDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;
	stat(objectKey: string): Promise<{ byteSize: number; checksumSha256?: string }>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	promote(sourceKey: string, destinationKey: string): Promise<void>;
	remove(objectKey: string): Promise<void>;
}
interface AttachmentParser {
	readonly kind: string;
	parse(bytes: Uint8Array): Promise<string>;
}
interface AttachmentParsers {
	select(mediaType: string, path: string): AttachmentParser | undefined;
}

interface AttachmentPreferencesStore {
	get(actor: ActorContext): Promise<AgentPreferences>;
}
interface AttachmentIndexer {
	index(
		actor: ActorContext,
		attachment: AttachmentView['attachment'],
		text: string
	): Promise<{ truncated: boolean }>;
}
interface DocumentOcr {
	parse(input: {
		documentUrl: string;
		kind: 'document' | 'image';
		fileName: string;
		visionModel: string;
		maxPages?: number;
	}): Promise<string>;
}
interface ImageDescriber {
	describe(input: { imageDataUrl: string; context?: string; model: string }): Promise<string>;
}

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
const maxParseBytes = (): number =>
	Number(process.env.ATTACHMENT_PARSE_MAX_BYTES ?? maxAttachmentBytes());
/** The OpenRouter model that describes the images OCR extracts from a document. */
const deploymentVisionModel = (): string =>
	process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ?? 'google/gemini-2.5-flash-lite';
const ocrMaxPages = (): number => Number(process.env.ATTACHMENT_OCR_MAX_PAGES ?? 100);
/** Long enough for the OCR service to fetch a large document, short enough to stay a capability. */
const OCR_URL_TTL_SECONDS = 900;
const MAX_READ_CHARS = 20_000;
const now = (): DateTime => new Date().toISOString() as DateTime;

export class AttachmentLibrary {
	constructor(
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository,
		private readonly storage: AttachmentStorage,
		private readonly parsers: AttachmentParsers,
		private readonly documentOcr: DocumentOcr,
		private readonly imageDescriber: ImageDescriber,
		private readonly retrieval?: RetrievalIndexRepository,
		private readonly indexer?: AttachmentIndexer,
		private readonly preferences?: AttachmentPreferencesStore
	) {}

	/**
	 * The model that reads this user's attachments. Processing runs off the
	 * request path and must not fail because a preference could not be read, so a
	 * lookup failure falls back to the environment rather than aborting the
	 * attachment.
	 */
	private async visionModel(actor: ActorContext): Promise<string> {
		if (!this.preferences) return deploymentVisionModel();
		try {
			return resolveAttachmentVisionModel(
				await this.preferences.get(actor),
				deploymentVisionModel()
			);
		} catch {
			return deploymentVisionModel();
		}
	}

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
		if (upload.noteId) await this.recordBundleRevision(actor, upload.noteId);
		return view;
	}

	startProcessing(actor: ActorContext, attachment: AttachmentView): void {
		void this.process(actor, attachment).catch(() => undefined);
	}

	list(actor: ActorContext, noteId: NoteId): Promise<readonly AttachmentView[]> {
		return this.attachments.list(actor, noteId);
	}

	listForProject(actor: ActorContext, projectId: ProjectId) {
		return this.attachments.listForProject(actor, projectId);
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
		void this.process(actor, queued).catch(() => undefined);
		return queued;
	}

	async removeById(actor: ActorContext, attachmentId: AttachmentId): Promise<void> {
		if (this.retrieval) await this.retrieval.deleteForAttachment(actor, attachmentId);
		const found = await this.attachments.findById(actor, attachmentId);
		await this.attachments.removeById(actor, attachmentId);
		if (found) await this.storage.remove(found.version.objectKey);
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
		const validatedPath = validateAttachmentPath(path);
		const found = await this.attachments.findByPath(actor, noteId, validatedPath);
		await this.attachments.remove(actor, noteId, validatedPath);
		await this.recordBundleRevision(actor, noteId);
		if (found) await this.storage.remove(found.version.objectKey);
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

	private async process(actor: ActorContext, view: AttachmentView): Promise<void> {
		await this.attachments.updateVersion(actor, {
			...view.version,
			processingStatus: 'processing'
		});
		try {
			const extraction = await this.extractText(view, await this.visionModel(actor));
			if (!extraction) {
				await this.attachments.updateVersion(actor, {
					...view.version,
					processingStatus: 'unsupported',
					processedAt: now()
				});
				return;
			}
			const extractedText = extraction.text;
			let status: AttachmentVersion['processingStatus'] = 'ready';
			if (this.indexer) {
				const result = await this.indexer.index(actor, view.attachment, extractedText);
				if (result.truncated) status = 'partial';
			}
			await this.attachments.updateVersion(actor, {
				...view.version,
				parserKind: extraction.parserKind,
				extractedText,
				processingStatus: status,
				processedAt: now()
			});
		} catch (error) {
			await this.attachments.updateVersion(actor, {
				...view.version,
				processingStatus: 'failed',
				processingFailure: error instanceof Error ? error.message : 'Processing failed',
				processedAt: now()
			});
		}
	}

	/**
	 * Plain text is decoded in-process — that is free and lossless, so a markdown
	 * or JSON attachment never costs an OCR call. Everything else the OCR engine
	 * accepts goes to OCR, which is what captures tables and embedded images.
	 *
	 * Returns undefined for a format nothing can read; OCR failures propagate so
	 * the attachment is recorded as failed and can be retried, rather than
	 * silently storing weaker text.
	 */
	private async extractText(
		view: AttachmentView,
		visionModel: string
	): Promise<{ text: string; parserKind: string } | undefined> {
		const { mediaType, byteSize, objectKey } = view.version;
		const path = view.attachment.path;
		const parseLimit = maxParseBytes();

		const parser = this.parsers.select(mediaType, path);
		if (parser && byteSize <= parseLimit)
			return {
				text: (await parser.parse(await this.storage.read(objectKey, parseLimit))).slice(
					0,
					parseLimit
				),
				parserKind: parser.kind
			};

		if (!isOcrSupported(mediaType, path)) return undefined;

		// OCR reads the object straight from a presigned URL, so no bytes pass
		// through this process.
		const image = isOcrImage(mediaType, path);
		const documentUrl = await this.storage.createDownloadUrl(objectKey, OCR_URL_TTL_SECONDS);
		const text = await this.documentOcr.parse({
			documentUrl,
			kind: image ? 'image' : 'document',
			fileName: path,
			visionModel,
			maxPages: ocrMaxPages()
		});
		// A photo can carry very little text, so an image keeps a description of
		// the image itself alongside whatever text OCR recovered.
		const sections = image ? [text.trim(), await this.describeImage(view, visionModel)] : [text];
		return { text: sections.filter(Boolean).join('\n\n'), parserKind: 'ocr' };
	}

	/** Non-fatal: an attachment is still worth storing without its description. */
	private async describeImage(view: AttachmentView, visionModel: string): Promise<string> {
		try {
			const imageUrl = await this.storage.createDownloadUrl(view.version.objectKey, 300);
			return `> **Image:** ${await this.imageDescriber.describe({ imageDataUrl: imageUrl, model: visionModel })}`;
		} catch {
			return '';
		}
	}
}
