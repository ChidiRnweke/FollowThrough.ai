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
	/** The signed-in account, from the session cookie; null once signed out. */
	readonly accountId: string | null;
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
		const current = this.bound();
		const intent = await this.store(
			this.preparation.attachment(owner, this.details(file)),
			file,
			'upload',
			current
		);
		await this.remote.complete(intent.upload.id);
		current();
	}
	async uploadInline(noteId: NoteId, file: File): Promise<string> {
		const current = this.bound();
		const intent = await this.store(
			this.preparation.inline(noteId, this.details(file), this.browser.identity()),
			file,
			'image',
			current
		);
		const uploaded = await this.remote.complete(intent.upload.id);
		current();
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	async uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string> {
		const current = this.bound();
		const intent = await this.store(
			this.preparation.screenshot(todoId, projectId, this.details(file), this.browser.now()),
			file,
			'screenshot',
			current
		);
		const uploaded = await this.remote.completeScreenshot(intent.upload.id, todoId);
		current();
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	/** An upload belongs to the account that started it; nothing completes for another. */
	private bound(): () => void {
		const accountId = this.browser.accountId;
		return () => {
			if (this.browser.accountId !== accountId)
				throw new Error('The workspace account changed during the attachment action.');
		};
	}
	private details(file: File) {
		return { name: file.name, mediaType: file.type, byteSize: file.size };
	}
	private async store(
		input: AttachmentUploadDraft,
		file: File,
		label: 'upload' | 'image' | 'screenshot',
		current: () => void
	): Promise<AttachmentUploadIntent> {
		const checksumSha256 = await this.browser.checksum(file);
		current();
		const intent = await this.remote.initiate({ ...input, checksumSha256 });
		current();
		const stored = await this.browser.put(intent, file);
		if (stored.kind === 'failure' && stored.reason === 'unreachable')
			throw new Error(
				`Could not reach file storage, so the ${label} was not saved. Check your connection, or ask the operator to allow this site in the storage CORS settings.`
			);
		if (stored.kind === 'failure')
			throw new Error(
				stored.detail
					? `File storage rejected the ${label}: ${stored.detail}`
					: `File storage rejected the ${label} (${stored.status})`
			);
		current();
		return intent;
	}
}
