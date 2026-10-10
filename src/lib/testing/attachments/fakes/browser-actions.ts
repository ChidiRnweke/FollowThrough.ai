import type { WorkspaceResourceBinding } from '$lib/models/browser-workspace';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { InMemoryOutbox } from '$lib/testing/sync/fakes/in-memory-outbox';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import { CacheCommitService } from '$lib/services/sync/state';
import type {
	AttachmentRemotePort,
	AttachmentBrowserPort,
	AttachmentSessionState,
	AttachmentAccount
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
	private readonly reserved = new Map<string, AttachmentView>();
	readonly completed: { readonly uploadId: string; readonly todoId?: TodoId }[] = [];
	readonly result: AttachmentView = attachmentViewBuilder({
		version: { processingStatus: 'queued' }
	});
	readonly uploadId: AttachmentUploadIntent['upload']['id'] =
		'00000000-0000-4000-8000-000000000101' as AttachmentUploadIntent['upload']['id'];
	completionFailure: Error | undefined;
	initiationFailure: Error | undefined;
	initiationGate: Promise<void> | undefined;
	readonly initiationStarted = Promise.withResolvers<void>();
	completionGate: Promise<void> | undefined;
	readonly completionStarted = Promise.withResolvers<void>();
	downloadGate: Promise<void> | undefined;
	readonly downloadStarted = Promise.withResolvers<void>();
	readonly retried: string[] = [];
	readonly removed: string[] = [];
	removal: RemoveAttachmentResult = { kind: 'removed' };
	async initiate(input: AttachmentUploadRequest): Promise<AttachmentUploadIntent> {
		if (this.initiationFailure) throw this.initiationFailure;
		this.initiated.push(input);
		const uploadId =
			`00000000-0000-4000-8000-${String(100 + this.initiated.length).padStart(12, '0')}` as AttachmentUploadIntent['upload']['id'];
		const attachmentId =
			`00000000-0000-4000-8098-${String(this.initiated.length).padStart(12, '0')}` as AttachmentView['attachment']['id'];
		const versionId =
			`00000000-0000-4000-8097-${String(this.initiated.length).padStart(12, '0')}` as AttachmentView['version']['id'];
		this.reserved.set(uploadId, {
			attachment: {
				...this.result.attachment,
				id: attachmentId,
				currentVersionId: versionId,
				path: input.path,
				projectId: input.projectId
					? (input.projectId as AttachmentView['attachment']['projectId'])
					: testProjectId(),
				...(input.noteId
					? { noteId: input.noteId as NonNullable<AttachmentView['attachment']['noteId']> }
					: {})
			},
			version: {
				...this.result.version,
				id: versionId,
				attachmentId,
				objectKey: `uploads/${uploadId}`,
				mediaType: input.mediaType,
				byteSize: input.byteSize,
				checksumSha256: input.checksumSha256
			}
		});
		this.initiationStarted.resolve();
		await this.initiationGate;
		return {
			upload: {
				id: uploadId,
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
		this.completionStarted.resolve();
		await this.completionGate;
		if (this.completionFailure) throw this.completionFailure;
		this.completed.push({ uploadId });
		const result = this.reserved.get(uploadId);
		if (!result) throw new Error('Unknown upload reservation');
		return result;
	}
	async completeScreenshot(uploadId: string, todoId: TodoId): Promise<AttachmentView> {
		this.completionStarted.resolve();
		await this.completionGate;
		if (this.completionFailure) throw this.completionFailure;
		this.completed.push({ uploadId, todoId });
		const result = this.reserved.get(uploadId);
		if (!result) throw new Error('Unknown upload reservation');
		return result;
	}
	async download(): Promise<{ url: string }> {
		this.downloadStarted.resolve();
		await this.downloadGate;
		return { url: 'https://storage.test/download' };
	}
	async retry(id: string): Promise<AttachmentView> {
		this.retried.push(id);
		return this.result;
	}
	async remove(id: string): Promise<RemoveAttachmentResult> {
		this.removed.push(id);
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
	checksumFailure: Error | undefined;
	checksumGate: Promise<void> | undefined;
	readonly checksumStarted = Promise.withResolvers<void>();
	async checksum(file: File): Promise<string> {
		this.checksumStarted.resolve();
		await this.checksumGate;
		if (this.checksumFailure) throw this.checksumFailure;
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
export class InMemoryAttachmentWorkspace implements AttachmentSessionState {
	generation = 0;
	resourceBinding: WorkspaceResourceBinding | null = {
		accountId: 'attachments-test',
		generation: 0,
		resourceKey: {}
	};
	readonly environment = { accountId: 'attachments-test', online: true };
	readonly cache = new InMemorySyncCache<WorkspaceRecord>();
	readonly repository = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		(_observed, local) => ({ value: local, overlaps: false }),
		this.cache
	);
	readonly transport = new InMemorySyncTransport<WorkspaceRecord>();
	readonly cacheState = new ResourceCacheStore<WorkspaceRecord>();
	readonly account: AttachmentAccount = {
		accountId: 'attachments-test',
		repository: this.repository,
		cacheStorage: this.cache,
		readTransport: this.transport,
		cacheState: this.cacheState,
		cacheMerge: new CacheCommitService()
	};
	readonly accounts = new WorkspaceCapabilityStore<AttachmentAccount>();
	constructor() {
		this.accounts.set(this.resourceBinding!.resourceKey, this.account);
	}
	stop(): void {
		this.generation++;
		this.resourceBinding = null;
	}
	replace(accountId = 'attachments-test'): void {
		this.generation++;
		this.environment.accountId = accountId;
		this.resourceBinding = { accountId, generation: this.generation, resourceKey: {} };
		this.accounts.set(this.resourceBinding.resourceKey, { ...this.account, accountId });
	}
}
