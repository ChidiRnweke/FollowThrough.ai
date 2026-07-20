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
	NoteRevisionId,
	ProjectId
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type { AttachmentRepository, NoteRepository } from '$lib/repositories';
import type {
	AttachmentParserRegistry,
	AttachmentStorage
} from '$lib/server/domain/attachment-storage';
import { validateAttachmentPath } from '$lib/services/skills/manifest';
import type { AttachmentManager } from './contracts';
import type { RetrievalIndexRepository } from '$lib/repositories';
import type { ContentChunker, EmbeddingClient } from '$lib/services/retrieval/contracts';
import { EmbeddedAttachmentIndexer } from '$lib/services/retrieval/indexing';

const MAX_ATTACHMENT_BYTES = Number(process.env.ATTACHMENT_MAX_BYTES ?? 50 * 1024 * 1024);
const MAX_PARSE_BYTES = Number(process.env.ATTACHMENT_PARSE_MAX_BYTES ?? MAX_ATTACHMENT_BYTES);
const MAX_READ_CHARS = 20_000;
const now = (): DateTime => new Date().toISOString() as DateTime;

export class AttachmentManagementService implements AttachmentManager {
	constructor(
		private readonly attachments: AttachmentRepository,
		private readonly notes: NoteRepository,
		private readonly storage: AttachmentStorage,
		private readonly parsers: AttachmentParserRegistry,
		private readonly retrieval?: RetrievalIndexRepository,
		private readonly embeddingClient?: EmbeddingClient,
		private readonly chunker?: ContentChunker
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
			const isImage = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
				view.version.mediaType
			);
			if (isImage) {
				const extractedText = await this.describeImage(view);
				if (this.retrieval && this.embeddingClient)
					await new EmbeddedAttachmentIndexer(
						this.retrieval,
						this.embeddingClient,
						this.chunker
					).index(actor, view.attachment, extractedText);
				await this.attachments.updateVersion(actor, {
					...view.version,
					parserKind: 'vision',
					extractedText,
					processingStatus: 'ready',
					processedAt: now()
				});
				return;
			}
			const parser = this.parsers.select(view.version.mediaType, view.attachment.path);
			if (!parser || view.version.byteSize > MAX_PARSE_BYTES) {
				await this.attachments.updateVersion(actor, {
					...view.version,
					processingStatus: 'unsupported',
					processedAt: now()
				});
				return;
			}
			const bytes = await this.storage.read(view.version.objectKey, MAX_PARSE_BYTES);
			const extractedText = (await parser.parse(bytes)).slice(0, MAX_PARSE_BYTES);
			let status: AttachmentVersion['processingStatus'] = 'ready';
			if (this.retrieval && this.embeddingClient) {
				const result = await new EmbeddedAttachmentIndexer(
					this.retrieval,
					this.embeddingClient,
					this.chunker
				).index(actor, view.attachment, extractedText);
				if (result.truncated) status = 'partial';
			}
			await this.attachments.updateVersion(actor, {
				...view.version,
				parserKind: parser.kind,
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

	private async describeImage(view: AttachmentView): Promise<string> {
		const key = process.env.OPENROUTER_API_KEY;
		if (!key) throw new Error('OPENROUTER_API_KEY is required for image processing');
		const imageUrl = await this.storage.createDownloadUrl(view.version.objectKey, 300);
		const response = await fetch(
			`${process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'}/chat/completions`,
			{
				method: 'POST',
				signal: AbortSignal.timeout(60_000),
				headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
				body: JSON.stringify({
					model: process.env.OPENROUTER_ATTACHMENT_VISION_MODEL ?? 'google/gemini-2.5-flash-lite',
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: 'Describe this image factually for search. Include visible text, charts, diagrams, objects, and layout. Do not make unsupported inferences.'
								},
								{ type: 'image_url', image_url: { url: imageUrl } }
							]
						}
					]
				})
			}
		);
		if (!response.ok) throw new Error(`Vision description failed (${response.status})`);
		const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
		const description = payload.choices?.[0]?.message?.content?.trim();
		if (!description) throw new Error('Vision model returned no description');
		return description;
	}
}
