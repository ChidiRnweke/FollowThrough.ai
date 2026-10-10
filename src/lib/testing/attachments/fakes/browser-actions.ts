import type {
	AttachmentRemotePort,
	AttachmentBrowserPort,
	AttachmentWorkspace,
	AttachmentWorkspaceSession
} from '$lib/controllers/attachments/controller';
import type {
	AttachmentUploadIntent,
	AttachmentUploadRequest,
	AttachmentObjectWrite,
	AttachmentView,
	RemoveAttachmentResult
} from '$lib/models/attachments';
import type { TodoId } from '$lib/models/todos';
import { attachmentViewBuilder } from '$lib/testing/attachments/fixtures/views';
import { testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
export class InMemoryAttachmentRemote implements AttachmentRemotePort {
	readonly initiated: AttachmentUploadRequest[] = [];
	readonly completed: { readonly uploadId: string; readonly todoId?: TodoId }[] = [];
	readonly result: AttachmentView = attachmentViewBuilder({
		version: { processingStatus: 'queued' }
	});
	readonly uploadId: AttachmentUploadIntent['upload']['id'] =
		'00000000-0000-4000-8000-000000000101' as AttachmentUploadIntent['upload']['id'];
	completionFailure: Error | undefined;
	removal: RemoveAttachmentResult = { kind: 'removed' };
	async initiate(input: AttachmentUploadRequest): Promise<AttachmentUploadIntent> {
		this.initiated.push(input);
		return {
			upload: {
				id: this.uploadId,
				projectId: input.projectId
					? (input.projectId as AttachmentUploadIntent['upload']['projectId'])
					: testProjectId(),
				...(input.noteId
					? { noteId: input.noteId as NonNullable<AttachmentUploadIntent['upload']['noteId']> }
					: {}),
				path: input.path,
				objectKey: 'pending/attachment',
				mediaType: input.mediaType,
				byteSize: input.byteSize,
				checksumSha256: input.checksumSha256,
				expiresAt: testNow,
				createdAt: testNow
			},
			uploadUrl: 'https://storage.test/put',
			requiredHeaders: { 'content-type': input.mediaType }
		};
	}
	async complete(uploadId: string): Promise<AttachmentView> {
		if (this.completionFailure) throw this.completionFailure;
		this.completed.push({ uploadId });
		return this.result;
	}
	async completeScreenshot(uploadId: string, todoId: TodoId): Promise<AttachmentView> {
		if (this.completionFailure) throw this.completionFailure;
		this.completed.push({ uploadId, todoId });
		return this.result;
	}
	async download(): Promise<{ url: string }> {
		return { url: 'https://storage.test/download' };
	}
	async retry(): Promise<AttachmentView> {
		return this.result;
	}
	async remove(): Promise<RemoveAttachmentResult> {
		return this.removal;
	}
}
export class InMemoryAttachmentBrowser implements AttachmentBrowserPort {
	readonly writes: { readonly url: string; readonly bytes: readonly number[] }[] = [];
	readonly opened: string[] = [];
	writeResult: AttachmentObjectWrite = { kind: 'stored' };
	writeGate: Promise<void> | undefined;
	readonly writeStarted = Promise.withResolvers<void>();
	private sequence = 0;
	checksum(file: File): Promise<string> {
		return fileChecksumSha256(file);
	}
	async put(intent: AttachmentUploadIntent, file: File): Promise<AttachmentObjectWrite> {
		this.writes.push({
			url: intent.uploadUrl,
			bytes: [...new Uint8Array(await file.arrayBuffer())]
		});
		this.writeStarted.resolve();
		await this.writeGate;
		return this.writeResult;
	}
	open(url: string): void {
		this.opened.push(url);
	}
	identity(): string {
		this.sequence += 1;
		return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`;
	}
	now(): number {
		return 1783857600000;
	}
}
export class InMemoryAttachmentSession implements AttachmentWorkspaceSession {
	readonly resources = {
		prepare: async (): Promise<void> => {},
		collectionReadiness: (): 'unknown' | 'ready' => 'ready',
		views: { attachments: (): readonly AttachmentView[] => [] }
	};
}
export class InMemoryAttachmentWorkspace implements AttachmentWorkspace {
	current: AttachmentWorkspaceSession | null = new InMemoryAttachmentSession();
	readonly synchronized: (AttachmentWorkspaceSession | null)[] = [];
	async synchronize(): Promise<{ readonly kind: 'complete' }> {
		this.synchronized.push(this.current);
		return { kind: 'complete' };
	}
}
