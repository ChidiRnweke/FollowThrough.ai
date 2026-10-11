import type {
	AttachmentView,
	AttachmentUploadOwner,
	AttachmentUploadDraft,
	AttachmentUploadIntent,
	AttachmentUploadRequest,
	AttachmentObjectWrite
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { AttachmentUploadPreparation } from '$lib/services/attachments/uploads';
export interface AttachmentRemotePort {
	initiate(input: AttachmentUploadRequest): Promise<AttachmentUploadIntent>;
	complete(uploadId: string): Promise<AttachmentView>;
	completeScreenshot(uploadId: string, todoId: TodoId): Promise<AttachmentView>;
}
export interface AttachmentBrowserPort {
	checksum(file: File): Promise<string>;
	put(intent: AttachmentUploadIntent, file: File): Promise<AttachmentObjectWrite>;
	identity(): string;
	now(): number;
}
/**
 * Uploads: checksum, reserve, send the bytes to object storage, then complete. The caller
 * refreshes the workspace once an upload completes; reads and the other attachment actions
 * are the workspace's and the remote functions'.
 */
export interface AttachmentsController {
	upload(owner: AttachmentUploadOwner, file: File): Promise<void>;
	uploadInline(noteId: NoteId, file: File): Promise<string>;
	uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string>;
}
/** Complete browser actions; no caller assembles reservation, byte transfer and completion. */
export class Attachments implements AttachmentsController {
	constructor(
		private readonly remote: AttachmentRemotePort,
		private readonly browser: AttachmentBrowserPort,
		private readonly preparation: AttachmentUploadPreparation
	) {}
	async upload(owner: AttachmentUploadOwner, file: File): Promise<void> {
		const intent = await this.store(
			this.preparation.attachment(owner, this.details(file)),
			file,
			'upload'
		);
		await this.remote.complete(intent.upload.id);
	}
	async uploadInline(noteId: NoteId, file: File): Promise<string> {
		const intent = await this.store(
			this.preparation.inline(noteId, this.details(file), this.browser.identity()),
			file,
			'upload'
		);
		const uploaded = await this.remote.complete(intent.upload.id);
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	async uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string> {
		const intent = await this.store(
			this.preparation.screenshot(todoId, projectId, this.details(file), this.browser.now()),
			file,
			'screenshot'
		);
		const uploaded = await this.remote.completeScreenshot(intent.upload.id, todoId);
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	private details(file: File) {
		return { name: file.name, mediaType: file.type, byteSize: file.size };
	}
	private async store(
		input: AttachmentUploadDraft,
		file: File,
		label: 'upload' | 'screenshot'
	): Promise<AttachmentUploadIntent> {
		const checksumSha256 = await this.browser.checksum(file);
		const intent = await this.remote.initiate({ ...input, checksumSha256 });
		const stored = await this.browser.put(intent, file);
		if (stored.kind === 'failure')
			throw new Error(
				stored.detail
					? `Object storage rejected the ${label}: ${stored.detail}`
					: `Object storage rejected the ${label} (${stored.status})`
			);
		return intent;
	}
}
