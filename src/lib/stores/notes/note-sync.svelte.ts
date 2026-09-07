import {
	noteSyncContentEquals,
	type Note,
	type NoteEditRecord,
	type NoteEditConflict,
	type NoteSyncStatus,
	type VersionedNote
} from '$lib/models/notes';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WriteBase } from '$lib/models/outbox';
import { compareSyncEtags } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import type { WorkspaceResources } from '$lib/stores/workspace/resources.svelte';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';

interface EditorContext {
	readonly base: WriteBase<WorkspaceRecord> | null;
	readonly basedOn: string | null;
	readonly local: Note;
}
const plain = <T>(value: T): T => $state.snapshot(value) as T;

/** Keeps the editor's observed base; persistence, delivery, and conflicts belong to the shared outbox. */
export class NoteSyncStore {
	private editor = $state<{ resources: WorkspaceResources; context: EditorContext } | null>(null);
	private get resources() {
		return this.editor?.resources ?? null;
	}
	private get context() {
		return this.editor?.context ?? null;
	}
	private error = $state<string | null>(null);
	private initial: VersionedNote | null = null;
	constructor(
		private readonly workspace: () => Promise<WorkspaceResources> = async () =>
			(await workspaceSession.start()).resources
	) {}
	private get entries() {
		const note = this.context?.local;
		if (!note || !this.resources) return [];
		const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
		return this.resources.pending.filter((entry) => entry.intent.key === key);
	}
	get status(): NoteSyncStatus {
		if (this.error) return 'error';
		if (!this.context) return 'loading';
		if (this.entries.some((entry) => entry.delivery.kind === 'conflict')) return 'conflict';
		if (
			this.entries.some(
				(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
			)
		)
			return 'error';
		if (this.entries.some((entry) => entry.delivery.kind === 'sending')) return 'saving';
		return this.entries.length ? 'pending' : 'synced';
	}
	get lastError(): string | undefined {
		if (this.error) return this.error;
		const failed = this.entries.find(
			(entry) => entry.delivery.kind === 'rejected' || entry.delivery.kind === 'retry'
		);
		return failed && (failed.delivery.kind === 'rejected' || failed.delivery.kind === 'retry')
			? failed.delivery.message
			: undefined;
	}
	get record(): NoteEditRecord | undefined {
		if (!this.context) return undefined;
		const latest = this.entries.at(-1)?.intent.local;
		let local = latest?.type === 'notes' ? latest.value : this.context.local;
		if (!this.entries.length && this.resources) {
			const snapshot = this.resources.snapshot({ type: 'notes', id: [local.id] });
			if (
				snapshot?.value.type === 'notes' &&
				noteSyncContentEquals(local, snapshot.value.value) &&
				local.sectionNumbering === snapshot.value.value.sectionNumbering
			)
				local = snapshot.value.value;
		}
		return {
			local,
			state:
				this.status === 'conflict'
					? 'conflict'
					: this.status === 'saving'
						? 'syncing'
						: this.entries.length
							? 'pending'
							: 'synced'
		};
	}
	get conflict(): NoteEditConflict | undefined {
		const entry = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		const local = this.record?.local;
		if (!entry || entry.delivery.kind !== 'conflict' || !local) return undefined;
		const base = entry.intent.base?.value;
		const remote = entry.delivery.remote;
		if (remote.kind === 'found' && remote.snapshot.value.type !== 'notes')
			throw new Error('A note conflict contains another resource type');
		return {
			base: base?.type === 'notes' ? base.value : null,
			local,
			remote:
				remote.kind === 'found' && remote.snapshot.value.type === 'notes'
					? { kind: 'found', note: remote.snapshot.value.value }
					: { kind: remote.kind === 'deleted' ? 'deleted' : 'unavailable' }
		};
	}
	async initialize(server: VersionedNote): Promise<Note> {
		this.initial = plain(server);
		this.error = null;
		try {
			const resources = await this.workspace();
			if (resources.accountId !== server.note.userId)
				throw new Error('The editor belongs to another account');
			const identity = { type: 'notes' as const, id: [server.note.id] as [string] };
			const opened = await resources.open(identity);
			if (opened.kind !== 'ready' || opened.value.type !== 'notes')
				throw new Error(
					opened.kind === 'failure' ? opened.message : 'This note is not available on this device'
				);
			const observed = resources.editBase(identity);
			if (observed.local.type !== 'notes')
				throw new Error('The editor opened another resource type');
			this.editor = {
				resources,
				context: { base: observed.base, basedOn: observed.basedOn, local: observed.local.value }
			};
			return observed.local.value;
			// audit-allow: silent-catch — the editor keeps the provided document and renders the storage failure through status and lastError.
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Device storage is unavailable';
			return server.note;
		}
	}
	async save(note: Note): Promise<NoteEditRecord | undefined> {
		this.error = null;
		try {
			const resources = this.resources;
			const context = this.context;
			if (!resources || !context) throw new Error('Open the note before saving');
			if (note.id !== context.local.id || note.userId !== context.local.userId)
				throw new Error('The editor changed resource identity');
			const local = plain(note);
			const identity = { type: 'notes' as const, id: [local.id] as [string] };
			let base = context.base;
			let basedOn = context.basedOn;
			// Acknowledgement may arrive while typing. Adopt it only if it still represents the prior local edit.
			const snapshot = resources.snapshot(identity);
			if (
				basedOn &&
				!resources.pending.some((entry) => entry.intent.operationId === basedOn) &&
				snapshot?.value.type === 'notes' &&
				noteSyncContentEquals(context.local, snapshot.value.value) &&
				context.local.sectionNumbering === snapshot.value.value.sectionNumbering
			) {
				base = snapshot;
				basedOn = null;
			}
			const operationId = await resources.append({
				operationId: crypto.randomUUID(),
				key: workspaceResourceKey(identity),
				command: {
					kind: 'saveNote',
					noteId: local.id,
					document: local.document,
					plainText: local.plainText,
					title: local.title,
					isPinned: local.isPinned
				},
				base,
				basedOn,
				local: { type: 'notes', value: local },
				coalesce: 'document',
				references: []
			});
			this.editor = { resources, context: { base, basedOn: operationId, local } };
			return this.record;
			// audit-allow: silent-catch — the editor leaves unsaved text dirty and renders the persistence failure through status and lastError.
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'The note could not be saved';
			return undefined;
		}
	}
	async retry(): Promise<NoteEditRecord | undefined> {
		if (!this.context && this.initial) await this.initialize(this.initial);
		if (!this.resources) return this.record;
		this.error = null;
		await this.resources.synchronize();
		return this.record;
	}
	async keepLocal(): Promise<NoteEditRecord | undefined> {
		const conflict = this.entries.find((entry) => entry.delivery.kind === 'conflict');
		if (!conflict || !this.resources) return this.record;
		await this.resources.keepLocal(conflict.intent.operationId);
		await this.resources.synchronize();
		return this.record;
	}
	async useRemote(): Promise<Note | undefined> {
		const resources = this.resources;
		const context = this.context;
		if (!resources || !context) return undefined;
		const identity = { type: 'notes' as const, id: [context.local.id] as [string] };
		const reviewed = this.entries;
		const conflict = reviewed.find((entry) => entry.delivery.kind === 'conflict');
		if (resources.online) await resources.synchronize();
		const snapshot = resources.snapshot(identity);
		if (conflict?.delivery.kind === 'conflict' && conflict.delivery.remote.kind === 'found') {
			const observed = conflict.delivery.remote.snapshot;
			if (
				!snapshot ||
				(observed.etag !== null
					? compareSyncEtags(snapshot.etag, observed.etag) < 0
					: !resources.online || resources.readStatus.kind !== 'complete')
			)
				throw new Error('Reconnect to validate the server copy before discarding your local edit');
		}
		if (!snapshot || snapshot.value.type !== 'notes')
			throw new Error('Reconnect to download the server copy before discarding your local edit');
		await resources.discard(reviewed.map((entry) => entry.intent.operationId));
		this.editor = {
			resources,
			context: { base: snapshot, basedOn: null, local: snapshot.value.value }
		};
		return snapshot.value.value;
	}
	reset(): void {
		this.editor = null;
		this.error = null;
		this.initial = null;
	}
}
