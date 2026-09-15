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
import {
	type AttachmentParser,
	type IAttachmentStorage,
	type StoredObjectInfo
} from '$lib/server/services/attachments/storage';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { ITextRecognition as OcrEngineClient } from '$lib/server/services/attachments/mistral-ocr';
import type { IImageDescription as ImageDescriber } from '$lib/server/services/attachments/image-description';
import type { RecognizedContent as OcrContentPart } from '$lib/models/attachments/ocr';

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
	async findByPath(): Promise<AttachmentView | undefined> {
		return undefined;
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
	async removeById(): Promise<void> {
		this.found = undefined;
	}
	async updateVersion(_actor: ActorContext, version: AttachmentVersion): Promise<AttachmentView> {
		this.updates.push(version);
		if (this.found) this.found = { ...this.found, version };
		return this.viewOf(version);
	}
	async listPendingVersions() {
		return this.found && ['queued', 'processing'].includes(this.found.version.processingStatus)
			? [{ ...testActor(), versionId: this.found.version.id }]
			: [];
	}
	async findVersionForUpdate() {
		return this.found;
	}
	snapshot() {
		const found = structuredClone(this.found);
		const updates = structuredClone(this.updates);
		return () => {
			this.found = found;
			this.updates.splice(0, this.updates.length, ...updates);
		};
	}
}

export class InMemoryStorage implements IAttachmentStorage {
	readonly objects = new Set(['objects/doc']);
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
	async read(): Promise<Uint8Array> {
		return new Uint8Array([1, 2, 3]);
	}
	async promote(): Promise<void> {}
	async remove(objectKey: string): Promise<void> {
		this.objects.delete(objectKey);
	}
}

export class InMemoryTextParser implements AttachmentParser {
	text = 'decoded text';
	beforeParse: () => Promise<void> = async () => {};
	readonly kind = 'text';
	calls = 0;
	supports(mediaType: string, path: string): boolean {
		return mediaType.startsWith('text/') || path.endsWith('.md');
	}
	async parse(): Promise<string> {
		this.calls += 1;
		await this.beforeParse();
		return this.text;
	}
}

export class InMemoryOcrEngine implements OcrEngineClient {
	calls: Parameters<OcrEngineClient['ocr']>[0][] = [];
	parts: readonly OcrContentPart[] = [{ kind: 'markdown', text: 'ocr text' }];
	beforeParse: () => Promise<void> = async () => {};
	failure?: Error;
	async ocr(input: Parameters<OcrEngineClient['ocr']>[0]) {
		this.calls.push(input);
		await this.beforeParse();
		if (this.failure) throw this.failure;
		return { parts: this.parts };
	}
}

export class InMemoryImageDescriber implements ImageDescriber {
	failure?: Error;
	calls: Parameters<ImageDescriber['describe']>[0][] = [];
	beforeDescribe: (input: Parameters<ImageDescriber['describe']>[0]) => Promise<void> =
		async () => {};
	descriptions = new Map<string, string>();
	async describe(input: Parameters<ImageDescriber['describe']>[0]): Promise<string> {
		this.calls.push(input);
		await this.beforeDescribe(input);
		if (this.failure) throw this.failure;
		return this.descriptions.get(input.imageDataUrl) ?? 'a factual description';
	}
}

export const finalUpdate = (repository: InMemoryAttachmentRepository): AttachmentVersion => {
	const final = repository.updates.at(-1);
	if (!final) throw new Error('Processing recorded no version update');
	return final;
};
