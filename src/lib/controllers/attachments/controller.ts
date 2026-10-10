import type {
	AttachmentView,
	AttachmentUploadOwner,
	AttachmentUploadDraft,
	AttachmentUploadIntent,
	AttachmentUploadRequest,
	AttachmentObjectWrite,
	RemoveAttachmentResult
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { AttachmentUploadPreparation } from '$lib/services/attachments/uploads';
import type { SessionSynchronization } from '$lib/controllers/workspace/session';
export interface AttachmentRemotePort {
	initiate(input: AttachmentUploadRequest): Promise<AttachmentUploadIntent>;
	complete(uploadId: string): Promise<AttachmentView>;
	completeScreenshot(uploadId: string, todoId: TodoId): Promise<AttachmentView>;
	download(attachmentId: string): Promise<{ readonly url: string }>;
	retry(attachmentId: string): Promise<AttachmentView>;
	remove(attachmentId: string): Promise<RemoveAttachmentResult>;
}
export interface AttachmentBrowserPort {
	checksum(file: File): Promise<string>;
	put(intent: AttachmentUploadIntent, file: File): Promise<AttachmentObjectWrite>;
	open(url: string): void;
	identity(): string;
	now(): number;
}
export interface AttachmentWorkspaceSession {
	readonly resources: {
		prepare(): Promise<void>;
		collectionReadiness(): 'unknown' | 'ready';
		readonly views: { attachments(owner: AttachmentUploadOwner): readonly AttachmentView[] };
	};
}
export interface AttachmentWorkspace {
	readonly current: AttachmentWorkspaceSession | null;
	synchronize(): Promise<SessionSynchronization>;
}
export interface AttachmentsController {
	readonly available: boolean;
	readonly ready: boolean;
	list(owner: AttachmentUploadOwner): readonly AttachmentView[];
	prepare(): Promise<void>;
	refresh(): Promise<void>;
	upload(owner: AttachmentUploadOwner, file: File): Promise<void>;
	uploadInline(noteId: NoteId, file: File): Promise<string>;
	uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string>;
	download(attachmentId: string): Promise<void>;
	retry(attachmentId: string): Promise<void>;
	remove(attachmentId: string): Promise<RemoveAttachmentResult>;
}
/** Complete browser actions; no caller assembles reservation, byte transfer and completion. */
export class Attachments implements AttachmentsController {
	constructor(
		private readonly remote: AttachmentRemotePort,
		private readonly browser: AttachmentBrowserPort,
		private readonly preparation: AttachmentUploadPreparation,
		private readonly workspace: AttachmentWorkspace
	) {}
	get available(): boolean {
		return this.workspace.current !== null;
	}
	get ready(): boolean {
		return this.workspace.current?.resources.collectionReadiness() === 'ready';
	}
	list(owner: AttachmentUploadOwner): readonly AttachmentView[] {
		return this.workspace.current?.resources.views.attachments(owner) ?? [];
	}
	async prepare(): Promise<void> {
		const session = this.workspace.current;
		if (!session) throw new Error('The workspace is not open.');
		await session.resources.prepare();
	}
	async refresh(): Promise<void> {
		await this.workspace.synchronize();
	}
	async upload(owner: AttachmentUploadOwner, file: File): Promise<void> {
		const session = this.workspace.current;
		const intent = await this.store(
			this.preparation.attachment(owner, this.details(file)),
			file,
			'upload',
			session
		);
		this.requireSession(session);
		await this.remote.complete(intent.upload.id);
		this.requireSession(session);
		await this.workspace.synchronize();
	}
	async uploadInline(noteId: NoteId, file: File): Promise<string> {
		const session = this.workspace.current;
		const intent = await this.store(
			this.preparation.inline(noteId, this.details(file), this.browser.identity()),
			file,
			'upload',
			session
		);
		this.requireSession(session);
		const uploaded = await this.remote.complete(intent.upload.id);
		this.requireSession(session);
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	async uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string> {
		const session = this.workspace.current;
		const intent = await this.store(
			this.preparation.screenshot(todoId, projectId, this.details(file), this.browser.now()),
			file,
			'screenshot',
			session
		);
		this.requireSession(session);
		const uploaded = await this.remote.completeScreenshot(intent.upload.id, todoId);
		this.requireSession(session);
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	async download(attachmentId: string): Promise<void> {
		const session = this.workspace.current;
		const { url } = await this.remote.download(attachmentId);
		this.requireSession(session);
		this.browser.open(url);
	}
	async retry(attachmentId: string): Promise<void> {
		const session = this.workspace.current;
		await this.remote.retry(attachmentId);
		this.requireSession(session);
		await this.workspace.synchronize();
	}
	async remove(attachmentId: string): Promise<RemoveAttachmentResult> {
		const session = this.workspace.current;
		const result = await this.remote.remove(attachmentId);
		this.requireSession(session);
		await this.workspace.synchronize();
		return result;
	}
	private details(file: File) {
		return { name: file.name, mediaType: file.type, byteSize: file.size };
	}
	private requireSession(session: AttachmentWorkspaceSession | null): void {
		if (session && this.workspace.current !== session)
			throw new Error('The workspace account changed during the attachment action.');
	}
	private async store(
		input: AttachmentUploadDraft,
		file: File,
		label: 'upload' | 'screenshot',
		session: AttachmentWorkspaceSession | null
	): Promise<AttachmentUploadIntent> {
		const checksumSha256 = await this.browser.checksum(file);
		this.requireSession(session);
		const intent = await this.remote.initiate({ ...input, checksumSha256 });
		this.requireSession(session);
		const stored = await this.browser.put(intent, file);
		if (stored.kind === 'failure')
			throw new Error(
				stored.detail
					? `Object storage rejected the ${label}: ${stored.detail}`
					: `Object storage rejected the ${label} (${stored.status})`
			);
		this.requireSession(session);
		return intent;
	}
}
