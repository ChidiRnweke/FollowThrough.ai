import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentUploadId,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type {
	AttachmentRepository,
	OwnedAttachmentUpload
} from '$lib/server/repositories/attachments/attachments';
import { type IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { StoredObjectInfo } from '$lib/models/attachments';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { RecognizedContent as OcrContentPart } from '$lib/models/attachments/ocr';
import { z } from 'zod';

export const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;
const VERSION_ID = '00000000-0000-4000-8000-0000000000b1' as AttachmentVersionId;
export const UPLOAD_ID = '00000000-0000-4000-8000-0000000000c1' as AttachmentUploadId;
const UPLOAD_BYTES = 128;
const UPLOAD_CHECKSUM = 'a'.repeat(64);

/** A pasted image: an upload that names the note it was dropped into. */
export const uploadFor = (noteId: NoteId): AttachmentUpload => ({
	id: UPLOAD_ID,
	projectId: testProjectId(),
	noteId,
	path: 'pasted-diagram.png',
	objectKey: 'uploads/pasted-diagram.png',
	mediaType: 'image/png',
	byteSize: UPLOAD_BYTES,
	checksumSha256: UPLOAD_CHECKSUM,
	expiresAt: new Date(Date.now() + 60_000).toISOString() as DateTime,
	createdAt: testNow
});

export const view = (mediaType: string, path = 'doc.pdf'): AttachmentView => ({
	attachment: {
		id: ATTACHMENT_ID,
		projectId: testProjectId(),
		path,
		currentVersionId: VERSION_ID,
		createdAt: testNow,
		updatedAt: testNow
	},
	version: {
		id: VERSION_ID,
		attachmentId: ATTACHMENT_ID,
		objectKey: 'objects/doc',
		mediaType,
		byteSize: 128,
		checksumSha256: 'a'.repeat(64),
		processingStatus: 'queued',
		createdAt: testNow
	}
});

export class InMemoryAttachmentRepository implements AttachmentRepository {
	readonly updates: AttachmentVersion[] = [];
	readonly removed: string[] = [];
	readonly pendingObjectRemovals = new Set<string>();
	found?: AttachmentView;
	/** Set by the tests that drive `complete()`; the rest never look one up. */
	upload?: AttachmentUpload;

	private viewOf(version: AttachmentVersion): AttachmentView {
		return { attachment: view('application/pdf').attachment, version };
	}

	createUpload(): Promise<AttachmentUpload> {
		throw new Error('not used');
	}
	async findUpload(): Promise<AttachmentUpload | undefined> {
		if (!this.upload) throw new Error('not used');
		return this.upload;
	}
	deleteUpload(): Promise<void> {
		throw new Error('not used');
	}
	listExpiredUploads(): Promise<readonly OwnedAttachmentUpload[]> {
		throw new Error('not used');
	}
	list(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	listForProject(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	linkToTodo(): Promise<void> {
		throw new Error('not used');
	}
	listForTodo(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	async findById(): Promise<AttachmentView | undefined> {
		return this.found;
	}
	async findByPath(
		_actor: ActorContext,
		noteId: NoteId,
		path: string
	): Promise<AttachmentView | undefined> {
		return this.found?.attachment.noteId === noteId && this.found.attachment.path === path
			? this.found
			: undefined;
	}
	async finalize(
		_actor: ActorContext,
		_upload: AttachmentUpload,
		version: AttachmentVersion
	): Promise<AttachmentView> {
		return this.viewOf(version);
	}
	async remove(_actor: ActorContext, _noteId: NoteId, path: string): Promise<void> {
		this.removed.push(path);
		this.found = undefined;
	}
	async listPendingObjectRemovals(): Promise<readonly string[]> {
		return [...this.pendingObjectRemovals];
	}
	async completeObjectRemoval(objectKey: string): Promise<void> {
		this.pendingObjectRemovals.delete(objectKey);
	}
	async removeById(): Promise<void> {
		if (this.found) this.pendingObjectRemovals.add(this.found.version.objectKey);
		this.found = undefined;
	}
	async updateVersion(_actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView> {
		this.updates.push(version);
		if (this.found) this.found = { ...this.found, version };
		return this.viewOf(version);
	}
	async listPendingVersions() {
		const version = this.found?.version;
		return version &&
			(['queued', 'processing'].includes(version.processingStatus) ||
				(version.processingStatus === 'partial' &&
					version.processingFailure === undefined &&
					version.extractedText !== undefined &&
					version.parserKind !== undefined))
			? [{ ...testActor(), versionId: version.id }]
			: [];
	}
	async findVersionForUpdate() {
		return this.found;
	}
	snapshot() {
		const pending = [...this.pendingObjectRemovals];
		const found = structuredClone(this.found);
		const updates = structuredClone(this.updates);
		return () => {
			this.pendingObjectRemovals.clear();
			for (const key of pending) this.pendingObjectRemovals.add(key);
			this.found = found;
			this.updates.splice(0, this.updates.length, ...updates);
		};
	}
}

export class InMemoryStorage implements IAttachmentStorage {
	readonly objects = new Set(['objects/doc']);
	readonly removalFailures = new Set<string>();
	createUploadUrl(): Promise<string> {
		throw new Error('not used');
	}
	async createDownloadUrl(): Promise<string> {
		return 'https://storage.test/presigned';
	}
	put(): Promise<void> {
		throw new Error('not used');
	}
	async stat(): Promise<StoredObjectInfo> {
		return { byteSize: UPLOAD_BYTES, checksumSha256: UPLOAD_CHECKSUM };
	}
	/** The stored text a text attachment decodes to. */
	text = 'decoded text';
	reads = 0;
	beforeRead: () => Promise<void> = async () => {};
	async read(): Promise<Uint8Array> {
		this.reads += 1;
		await this.beforeRead();
		return new TextEncoder().encode(this.text);
	}
	async promote(): Promise<void> {}
	async remove(objectKey: string): Promise<void> {
		if (this.removalFailures.has(objectKey)) throw new Error('Object removal failed');
		this.objects.delete(objectKey);
	}
}

const ocrRequestSchema = z.object({
	document: z.union([
		z.object({ type: z.literal('document_url'), document_url: z.string() }),
		z.object({ type: z.literal('image_url'), image_url: z.string() })
	])
});

/** Mistral Document AI over `fetch`: one page whose markdown places each image part. */
export class InMemoryOcrEngine {
	calls: { readonly documentUrl: string; readonly kind: 'document' | 'image' }[] = [];
	parts: readonly OcrContentPart[] = [{ kind: 'markdown', text: 'ocr text' }];
	beforeParse: () => Promise<void> = async () => {};
	failure?: Error;
	readonly fetch: typeof globalThis.fetch = async (_url, init) => {
		const { document } = ocrRequestSchema.parse(JSON.parse(String(init?.body)));
		this.calls.push(
			document.type === 'image_url'
				? { documentUrl: document.image_url, kind: 'image' }
				: { documentUrl: document.document_url, kind: 'document' }
		);
		await this.beforeParse();
		if (this.failure) throw this.failure;
		const images = this.parts.flatMap((part, index) =>
			part.kind === 'image' ? [{ id: `img-${index}`, image_base64: part.dataUrl }] : []
		);
		const markdown = this.parts
			.map((part, index) => (part.kind === 'image' ? `![img-${index}](img-${index})` : part.text))
			.join('\n\n');
		return Response.json({ pages: [{ index: 0, markdown, images }] });
	};
}

const visionRequestSchema = z.object({
	model: z.string(),
	messages: z.tuple([
		z.object({
			content: z.tuple([
				z.object({ text: z.string() }),
				z.object({ image_url: z.object({ url: z.string() }) })
			])
		})
	])
});

/** The vision chat endpoint over `fetch`, describing each image by its data URL. */
export class InMemoryImageDescriber {
	failure?: Error;
	calls: { readonly imageDataUrl: string; readonly prompt: string; readonly model: string }[] = [];
	beforeDescribe: (input: { readonly imageDataUrl: string }) => Promise<void> = async () => {};
	descriptions = new Map<string, string>();
	readonly fetch: typeof globalThis.fetch = async (_url, init) => {
		const request = visionRequestSchema.parse(JSON.parse(String(init?.body)));
		const [text, image] = request.messages[0].content;
		const call = { imageDataUrl: image.image_url.url, prompt: text.text, model: request.model };
		this.calls.push(call);
		await this.beforeDescribe(call);
		if (this.failure) throw this.failure;
		return Response.json({
			choices: [
				{
					message: { content: this.descriptions.get(call.imageDataUrl) ?? 'a factual description' }
				}
			]
		});
	};
}

export const finalUpdate = (repository: InMemoryAttachmentRepository): AttachmentVersion => {
	const final = repository.updates.at(-1);
	if (!final) throw new Error('Processing recorded no version update');
	return final;
};
