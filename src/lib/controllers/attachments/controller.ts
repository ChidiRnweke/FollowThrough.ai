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
import type {
	CacheStorage,
	SyncReadTransport,
	WorkspaceLocalRepository,
	WorkspaceResourceBinding,
	NoteEditorIdentity,
	NoteEditorState
} from '$lib/models/browser-workspace';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	initialSyncCursor,
	type SyncPage,
	type SynchronizationResult,
	type CachedRecord
} from '$lib/models/sync';
import type { ICacheCommitService, IWorkspaceProjectionService } from '$lib/services/sync/state';
import type { AttachmentPresentation } from '$lib/services/attachments/presentation';
import type { ResourceCacheStateAccess } from '$lib/stores/sync/cache';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';
import type { AttachmentViewState } from '$lib/stores/attachments/view.svelte';
export interface AttachmentAccount {
	readonly accountId: string;
	readonly repository: WorkspaceLocalRepository<WorkspaceCommand, WorkspaceRecord>;
	readonly cacheStorage: CacheStorage<WorkspaceRecord>;
	readonly readTransport: SyncReadTransport<WorkspaceRecord>;
	readonly cacheState: ResourceCacheStateAccess<WorkspaceRecord>;
	readonly cacheMerge: ICacheCommitService;
}
export interface AttachmentSessionState {
	readonly resourceBinding: WorkspaceResourceBinding | null;
	readonly generation: number;
}
export interface AttachmentEnvironment {
	readonly accountId: string | null;
	readonly online: boolean;
}
interface AttachmentOperation {
	readonly binding: WorkspaceResourceBinding;
	readonly account: AttachmentAccount;
}
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
export interface AttachmentsController {
	readonly available: boolean;
	readonly sessionGeneration: number;
	readonly failure: string | null;
	readonly ready: boolean;
	list(owner: AttachmentUploadOwner): readonly AttachmentView[];
	prepare(): Promise<void>;
	refresh(): Promise<void>;
	upload(owner: AttachmentUploadOwner, file: File): Promise<void>;
	uploadInline(noteId: NoteId, file: File, editorIdentity?: NoteEditorIdentity): Promise<string>;
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
		private readonly session: AttachmentSessionState,
		private readonly accounts: WorkspaceCapabilityRegistry<AttachmentAccount>,
		private readonly environment: AttachmentEnvironment,
		private readonly state: AttachmentViewState,
		private readonly presentation: AttachmentPresentation,
		private readonly projection: IWorkspaceProjectionService,
		private readonly editors: WorkspaceCapabilityRegistry<{ readonly state: NoteEditorState }>
	) {}
	get sessionGeneration(): number {
		return this.session.generation;
	}
	get available(): boolean {
		return this.session.resourceBinding !== null;
	}
	private get viewCurrent(): boolean {
		const binding = this.state.binding;
		const current = this.session.resourceBinding;
		return (
			binding !== null &&
			current !== null &&
			binding.resourceKey === current.resourceKey &&
			binding.generation === current.generation &&
			binding.accountId === this.environment.accountId
		);
	}
	get failure(): string | null {
		return this.viewCurrent ? this.state.failure : null;
	}
	get ready(): boolean {
		return this.viewCurrent && this.state.local?.cache.inventoryComplete === true;
	}
	list(owner: AttachmentUploadOwner): readonly AttachmentView[] {
		const local = this.state.local;
		if (!this.viewCurrent || !local) return [];
		const records = this.projection.project(
			new Map(local.cache.records.map((row) => [row.key, row.entry])),
			local.writes.entries
		);
		return this.presentation.list(owner, records.values());
	}
	async prepare(): Promise<void> {
		const operation = this.begin();
		if (!this.viewCurrent || this.state.failure) {
			this.state.unsubscribe?.();
			this.state.setSubscription(null);
			this.state.bind(operation.binding);
		}
		await this.readLocal(operation);
		if (!this.state.unsubscribe) this.observe(operation);
		if (this.environment.online) await this.synchronize(operation);
	}
	async refresh(): Promise<void> {
		await this.synchronize(this.begin());
	}
	private observe(operation: AttachmentOperation): void {
		this.state.setSubscription(
			operation.account.repository.observe(
				operation.binding.accountId,
				(local) => {
					if (this.current(operation) && this.viewCurrent) this.state.publish(local);
				},
				(error) => {
					if (this.current(operation) && this.viewCurrent) this.state.fail(error.message);
				}
			)
		);
	}
	private async readLocal(operation: AttachmentOperation): Promise<void> {
		const generation = this.state.advanceRead();
		const local = await operation.account.repository.read(operation.binding.accountId);
		this.requireSession(operation);
		// Once observation starts it is the sole publisher. A separate read must not
		// overwrite a newer live-query projection with an older snapshot.
		if (!this.state.unsubscribe && this.viewCurrent && generation === this.state.readGeneration)
			this.state.publish(local);
	}
	private begin(): AttachmentOperation {
		const binding = this.session.resourceBinding;
		if (!binding) throw new Error('The workspace is not open.');
		const operation = { binding, account: this.accounts.get(binding.resourceKey) };
		this.requireSession(operation);
		return operation;
	}
	private current({ binding, account }: AttachmentOperation): boolean {
		const current = this.session.resourceBinding;
		return (
			current !== null &&
			current.accountId === binding.accountId &&
			current.resourceKey === binding.resourceKey &&
			current.generation === binding.generation &&
			this.environment.accountId === binding.accountId &&
			!account.cacheState.read().stopped
		);
	}
	private async synchronize(operation: AttachmentOperation): Promise<void> {
		this.requireSession(operation);
		const { cacheState } = operation.account;
		const previous = cacheState.read().checking;
		if (previous) {
			await previous;
			this.requireSession(operation);
		}
		// A pull already running at entry may predate the mutation. Join only a subsequent pass.
		let checking = cacheState.read().checking;
		if (!checking || checking === previous) {
			checking = this.pull(operation).finally(() => {
				if (cacheState.read().checking === checking) cacheState.update({ checking: null });
			});
			cacheState.update({ checking });
		}
		const result = await checking;
		this.requireSession(operation);
		if (result.kind !== 'complete')
			throw new Error(
				result.kind === 'failure' ? result.message : `Attachment synchronization is ${result.kind}.`
			);
		await this.readLocal(operation);
	}
	private async pull(operation: AttachmentOperation): Promise<SynchronizationResult> {
		try {
			if (!this.environment.online) return { kind: 'offline' };
			const { account, binding } = operation;
			let stored = await account.cacheStorage.load(binding.accountId);
			this.requireSession(operation);
			let more: boolean;
			do {
				this.requireSession(operation);
				if (!this.environment.online) return { kind: 'offline' };
				const before = stored.cursor ?? initialSyncCursor;
				const page = await account.readTransport.pull(before);
				this.requireSession(operation);
				if (
					BigInt(page.cursor) < BigInt(before) ||
					(page.hasMore && BigInt(page.cursor) === BigInt(before))
				)
					throw new Error('The server page did not advance its checkpoint');
				await this.commitPage(operation, page);
				this.requireSession(operation);
				stored = await account.cacheStorage.load(binding.accountId);
				this.requireSession(operation);
				more = page.hasMore;
			} while (more);
			return { kind: 'complete' };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Attachment synchronization failed'
			};
		}
	}
	private async commitPage(
		operation: AttachmentOperation,
		page: SyncPage<WorkspaceRecord>
	): Promise<void> {
		const put: CachedRecord<WorkspaceRecord>[] = page.records.map(({ key, resource }) => ({
			key,
			entry: resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
		}));
		await operation.account.cacheStorage.transaction(operation.binding.accountId, async (tx) => {
			this.requireSession(operation);
			const previous = await tx.resources(put.map((row) => row.key));
			const checkpoint = await tx.checkpoint();
			this.requireSession(operation);
			const decision = operation.account.cacheMerge.decide(previous, checkpoint, {
				put,
				remove: [],
				cursor: page.cursor,
				inventoryComplete: !page.hasMore
			});
			await tx.put(decision.put);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
			this.requireSession(operation);
		});
	}
	async upload(owner: AttachmentUploadOwner, file: File): Promise<void> {
		const session = this.begin();
		const intent = await this.store(
			this.preparation.attachment(owner, this.details(file)),
			file,
			'upload',
			session
		);
		this.requireSession(session);
		await this.remote.complete(intent.upload.id);
		this.requireSession(session);
		await this.synchronize(session);
	}
	async uploadInline(
		noteId: NoteId,
		file: File,
		editorIdentity?: NoteEditorIdentity
	): Promise<string> {
		const state = editorIdentity ? this.editors.get(editorIdentity).state : null;
		const target = state ? { state, generation: state.documentGeneration } : null;
		if (target && (!target.state.active || !target.state.initialized))
			throw new Error('The image editor is no longer available.');
		const session = this.begin();
		const intent = await this.store(
			this.preparation.inline(noteId, this.details(file), this.browser.identity()),
			file,
			'upload',
			session
		);
		this.requireSession(session);
		const uploaded = await this.remote.complete(intent.upload.id);
		this.requireSession(session);
		if (
			target &&
			(!target.state.active ||
				!target.state.initialized ||
				target.state.documentGeneration !== target.generation)
		)
			throw new Error('The image editor changed during the upload.');
		return `/api/attachments/${uploaded.attachment.id}/content`;
	}
	async uploadScreenshot(todoId: TodoId, projectId: ProjectId, file: File): Promise<string> {
		const session = this.begin();
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
		const session = this.begin();
		const { url } = await this.remote.download(attachmentId);
		this.requireSession(session);
		this.browser.open(url);
	}
	async retry(attachmentId: string): Promise<void> {
		const session = this.begin();
		await this.remote.retry(attachmentId);
		this.requireSession(session);
		await this.synchronize(session);
	}
	async remove(attachmentId: string): Promise<RemoveAttachmentResult> {
		const session = this.begin();
		const result = await this.remote.remove(attachmentId);
		this.requireSession(session);
		if (result.kind === 'removed') await this.synchronize(session);
		return result;
	}
	private details(file: File) {
		return { name: file.name, mediaType: file.type, byteSize: file.size };
	}
	private requireSession(session: AttachmentOperation): void {
		if (!this.current(session))
			throw new Error('The workspace account changed during the attachment action.');
	}
	private async store(
		input: AttachmentUploadDraft,
		file: File,
		label: 'upload' | 'screenshot',
		session: AttachmentOperation
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
