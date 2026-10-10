import type { Note, NoteId, NoteRevisionId, SectionNumberingLevel } from '$lib/models/notes';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { SyncScheduler } from '$lib/models/sync';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import type { EditorSessionController } from '$lib/controllers/workspace/editor-session';
import type { WorkspaceSessionController } from '$lib/controllers/workspace/session';
import type { NoteDraftEditingController } from './draft-editing';
import type { NoteEditorOperations } from './editor-operations';
import type { NoteHistoryReader } from './history';

export interface NoteWorkspaceState {
	readonly active: boolean;
	readonly note: Note | null;
	readonly publishing: boolean;
	readonly cancelAutosave: (() => void) | null;
	setNote(note: Note): void;
	setPublishing(value: boolean): void;
	setAutosave(cancel: (() => void) | null): void;
	release(): void;
}
export interface NoteWorkspaceRevisions extends NoteHistoryReader {
	restore(noteId: NoteId, revisionId: NoteRevisionId): Promise<void>;
}
export interface NoteWorkspaceFeedback {
	error(message: string): void;
	success(message: string): void;
	info(message: string): void;
}
export interface NoteWorkspaceRules {
	noteHasUnpublishedChanges(note: Note, commands: readonly WorkspaceCommand[]): boolean;
}
export interface NoteWorkspaceDependencies {
	readonly state: NoteWorkspaceState;
	readonly draft: WorkspaceDraftController<'notes'>;
	readonly session: EditorSessionController;
	readonly editing: NoteDraftEditingController;
	readonly editor: () =>
		Pick<NoteEditorOperations, 'getDocument' | 'getPlainText' | 'replaceDocument'> | undefined;
	readonly workspace: Pick<WorkspaceSessionController, 'current' | 'synchronize'>;
	readonly revisions: NoteWorkspaceRevisions;
	readonly feedback: NoteWorkspaceFeedback;
	readonly scheduler: SyncScheduler;
	readonly rules: NoteWorkspaceRules;
	readonly conflictChanged: (open: boolean) => void;
}
export interface NoteWorkspaceController {
	readonly note: Note;
	readonly dirty: boolean;
	readonly saveFailed: boolean;
	readonly publishing: boolean;
	readonly unsynced: boolean;
	readonly hasUnpublishedChanges: boolean;
	readonly sync: Pick<WorkspaceDraftController<'notes'>, 'status' | 'lastError' | 'conflict'>;
	open(): void;
	close(): void;
	changed(): void;
	titleChanged(title: string): void;
	placementChanged(parentId: NoteId | undefined, position: number): void;
	adoptNewer(): void;
	reconcileSaved(observed: Note): void;
	save(options?: { auto?: boolean }): Promise<void>;
	ensureSynchronized(message: string): Promise<boolean>;
	togglePin(): Promise<void>;
	numbering(level: SectionNumberingLevel): Promise<void>;
	publish(): Promise<void>;
	restoreRevision(revisionId: NoteRevisionId): Promise<boolean>;
	discardDraft(): Promise<void | { kind: 'failure' }>;
	retrySync(): Promise<void>;
	useRemoteVersion(): Promise<void>;
	keepLocalVersion(): Promise<void>;
}
/** One mounted note buffer. Persistence and operation ancestry remain owned by its draft. */
export class NoteWorkspace implements NoteWorkspaceController {
	constructor(private readonly dependencies: NoteWorkspaceDependencies) {}
	private get active(): boolean {
		return this.dependencies.state.active && this.dependencies.draft.active;
	}
	get note(): Note {
		const note = this.dependencies.state.note;
		if (!note) throw new Error('Open the note workspace before reading it');
		return note;
	}
	get dirty(): boolean {
		return this.dependencies.session.dirty;
	}
	get saveFailed(): boolean {
		return this.dependencies.session.failure !== null;
	}
	get publishing(): boolean {
		return this.dependencies.state.publishing;
	}
	get sync(): NoteWorkspaceController['sync'] {
		const { status, lastError, conflict } = this.dependencies.draft;
		return { status, lastError, conflict };
	}
	get unsynced(): boolean {
		return ['pending', 'conflict', 'error'].includes(this.dependencies.draft.status);
	}
	get hasUnpublishedChanges(): boolean {
		const { workspace, rules } = this.dependencies;
		return rules.noteHasUnpublishedChanges(
			this.note,
			workspace.current?.resources.pending.map((entry) => entry.intent.command) ?? []
		);
	}
	open(): void {
		if (!this.active || this.dependencies.state.note) return;
		this.dependencies.state.setNote({ ...this.dependencies.draft.adopt() });
		this.reportConflict();
	}
	close(): void {
		this.cancelAutosave();
		this.dependencies.state.setPublishing(false);
		this.dependencies.session.close();
		this.dependencies.state.release();
	}
	private cancelAutosave(): void {
		this.dependencies.state.cancelAutosave?.();
		this.dependencies.state.setAutosave(null);
	}
	changed(): void {
		if (!this.active) return;
		this.dependencies.session.changed();
		this.cancelAutosave();
		const { scheduler, state } = this.dependencies;
		state.setAutosave(scheduler.schedule(scheduler.now() + 2000, () => this.save({ auto: true })));
	}
	titleChanged(title: string): void {
		if (!this.active) return;
		this.dependencies.state.setNote({ ...this.note, title });
		this.changed();
	}
	placementChanged(parentId: NoteId | undefined, position: number): void {
		if (this.active) this.dependencies.state.setNote({ ...this.note, parentId, position });
	}
	adoptNewer(): void {
		const { draft } = this.dependencies;
		if (!this.active || !draft.newer || this.dirty) return;
		this.replace(draft.adopt(), this.note.document);
	}
	/** Acknowledgements update revision metadata without touching selection or undo. */
	reconcileSaved(observed: Note): void {
		const { draft, state } = this.dependencies;
		if (!this.active || this.dirty || draft.status !== 'synced') return;
		if (observed.id !== this.note.id) throw new Error('The saved note belongs to another pane');
		if (draft.newer) {
			this.adoptNewer();
			return;
		}
		if (
			observed.currentRevision === this.note.currentRevision &&
			observed.publishedRevision === this.note.publishedRevision &&
			observed.publishedAt === this.note.publishedAt &&
			observed.updatedAt === this.note.updatedAt
		)
			return;
		const acknowledged = draft.adopt();
		state.setNote({
			...this.note,
			currentRevision: acknowledged.currentRevision,
			publishedRevision: acknowledged.publishedRevision,
			publishedAt: acknowledged.publishedAt,
			updatedAt: acknowledged.updatedAt
		});
	}

	private replace(note: Note, previous?: Note['document']): void {
		if (!this.active) return;
		this.cancelAutosave();
		this.dependencies.session.accept(() => {
			this.dependencies.state.setNote({ ...note });
			this.dependencies.editor()?.replaceDocument(note.document, previous);
		});
	}
	private reportConflict(): void {
		if (this.active)
			this.dependencies.conflictChanged(this.dependencies.draft.status === 'conflict');
	}
	async save(options: { auto?: boolean } = {}): Promise<void> {
		const { editor, session, editing, state, feedback } = this.dependencies;
		if (!this.active || !editor()) return;
		if (!this.dirty) {
			if (!options.auto && this.unsynced) await this.retrySync();
			return;
		}
		if (!this.note.title.trim()) {
			if (!options.auto) feedback.error('Give the note a title first.');
			return;
		}
		this.cancelAutosave();
		await session.save(
			async () => {
				const current = editor();
				if (!current) return { kind: 'failure', message: 'The editor is unavailable' };
				return editing.save({
					...this.note,
					title: this.note.title.trim(),
					document: current.getDocument(),
					plainText: current.getPlainText()
				});
			},
			(value, unchanged) => {
				state.setNote(
					unchanged
						? { ...value }
						: { ...this.note, currentRevision: value.currentRevision, updatedAt: value.updatedAt }
				);
				this.reportConflict();
			}
		);
		if (this.active && session.failure && !options.auto) feedback.error(session.failure);
	}
	async ensureSynchronized(message: string): Promise<boolean> {
		if (!this.active) return false;
		if (this.dirty) await this.save({ auto: true });
		if (!this.active) return false;
		if (this.dirty || this.dependencies.draft.status !== 'synced') {
			this.dependencies.feedback.error(message);
			return false;
		}
		return true;
	}
	async numbering(level: SectionNumberingLevel): Promise<void> {
		if (!this.active) return;
		const { session, editing, feedback, state } = this.dependencies;
		const current = session.checkpoint();
		const result = await editing.numbering(level);
		if (!current()) return;
		if (result.kind === 'failure') feedback.error(result.message);
		else state.setNote({ ...this.note, sectionNumbering: result.value.sectionNumbering });
	}
	async togglePin(): Promise<void> {
		const { editor, session, editing, state, feedback, draft, workspace } = this.dependencies;
		if (!this.active || !editor()) return;
		if (this.dirty) await this.save({ auto: true });
		const currentEditor = editor();
		if (!this.active || this.dirty || !currentEditor) return;
		const current = session.checkpoint();
		const result = await editing.togglePin({
			...this.note,
			document: currentEditor.getDocument(),
			plainText: currentEditor.getPlainText()
		});
		if (!current()) return;
		if (result.kind === 'failure') {
			feedback.error('Could not update pin. Try again.');
			return;
		}
		state.setNote({ ...result.value });
		session.accept();
		this.reportConflict();
		feedback.success(this.note.isPinned ? 'Pinned' : 'Unpinned');
		if (draft.status === 'synced') await workspace.synchronize();
	}
	async publish(): Promise<void> {
		const { state, session, draft, feedback } = this.dependencies;
		if (!this.active || this.publishing) return;
		state.setPublishing(true);
		try {
			if (this.dirty) await this.save();
			if (!this.active) return;
			if (this.dirty || draft.status === 'error' || draft.status === 'conflict') {
				feedback.error('Save or resolve the note before publishing.');
				return;
			}
			const current = session.checkpoint();
			const result = await draft.stage({ kind: 'publishNote', noteId: this.note.id });
			if (!current()) return;
			if (result.kind === 'failure') {
				feedback.error(result.message);
				return;
			}
			if (!result.value) {
				feedback.error('The note no longer exists');
				return;
			}
			state.setNote({
				...this.note,
				publishedRevision: result.value.publishedRevision,
				publishedAt: result.value.publishedAt
			});
			feedback.success('Publication saved on this device');
		} finally {
			if (this.active) state.setPublishing(false);
		}
	}
	async retrySync(): Promise<void> {
		if (!this.active) return;
		const { session, draft, state, feedback, workspace } = this.dependencies;
		const current = session.checkpoint();
		await draft.retry();
		if (!this.active) return;
		const local = draft.value;
		if (!local) {
			feedback.error(draft.lastError ?? 'This resource is unavailable');
			return;
		}
		if (current() && !this.dirty) state.setNote({ ...local });
		this.reportConflict();
		if (draft.status === 'synced') await workspace.synchronize();
		else if (draft.lastError) feedback.error(draft.lastError);
	}
	async useRemoteVersion(): Promise<void> {
		if (!this.active) return;
		const { draft, session, workspace } = this.dependencies;
		const remote = await draft.discard(session.checkpoint());
		if (!this.active || remote.kind === 'superseded') return;
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		this.replace(remote.value);
		await workspace.synchronize();
	}
	async keepLocalVersion(): Promise<void> {
		if (!this.active) return;
		const { draft, session, state, workspace } = this.dependencies;
		const current = session.checkpoint();
		await draft.keep();
		if (!current() || this.dirty) return;
		const local = draft.value;
		if (!local) throw new Error('The local edit is unavailable');
		state.setNote({ ...local });
		this.reportConflict();
		if (draft.status === 'synced') await workspace.synchronize();
	}
	private async reopen(current: () => boolean): Promise<boolean> {
		const opened = await this.dependencies.draft.read(current);
		if (!this.active) return false;
		if (opened.kind === 'superseded') {
			this.dependencies.feedback.info(
				'The server version changed. Your later edits are retained for review.'
			);
			return false;
		}
		if (opened.kind !== 'ready') throw new Error('The saved note could not be reopened');
		this.replace(opened.value);
		return true;
	}
	async restoreRevision(revisionId: NoteRevisionId): Promise<boolean> {
		if (!(await this.ensureSynchronized('Sync the note before restoring a version.'))) return false;
		const { session, revisions, workspace, feedback } = this.dependencies;
		const result = await this.attempt(async () => {
			const current = session.checkpoint();
			await revisions.restore(this.note.id, revisionId);
			if (!this.active) return;
			await workspace.synchronize();
			if (await this.reopen(current)) feedback.success('Restored that version');
		});
		if (result.kind === 'failure') {
			if (this.active) feedback.error('Could not restore that version. Try again.');
			return false;
		}
		return this.active;
	}
	async discardDraft(): Promise<void | { kind: 'failure' }> {
		if (!this.active || this.note.publishedRevision === 0) return;
		if (!(await this.ensureSynchronized('Save the note before discarding changes.'))) return;
		const { session, revisions, draft, feedback, workspace } = this.dependencies;
		const result = await this.attempt(async () => {
			const current = session.checkpoint();
			const observed = this.note;
			const history = await revisions.list(observed.id);
			const published = history.find(
				(revision) => revision.revision === observed.publishedRevision
			);
			if (!published) throw new Error('The published version is unavailable');
			const revision = await revisions.read(observed.id, published.id);
			if (!current()) return;
			const saved = await draft.discardPublished(revision);
			if (saved.kind === 'failure') throw new Error(saved.message);
			if (!(await this.reopen(current))) return;
			feedback.success('Reverted to last published version');
			await workspace.synchronize();
		});
		if (result.kind === 'failure') {
			if (this.active) feedback.error('Could not discard changes. Try again.');
			return result;
		}
	}
	private async attempt(
		work: () => Promise<void>
	): Promise<{ kind: 'success' } | { kind: 'failure' }> {
		try {
			await work();
			return { kind: 'success' };
		} catch {
			return { kind: 'failure' };
		}
	}
}
