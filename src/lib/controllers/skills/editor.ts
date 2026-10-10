import type { SessionSynchronization } from '$lib/controllers/workspace/session';
import type { Note, NoteId, ProseMirrorDocument } from '$lib/models/notes';
import type { DraftStatus, WriteConflictView, EditorSave } from '$lib/models/outbox';
import type { WorkspaceSkill } from '$lib/models/workspace-views';
import type { SyncScheduler } from '$lib/models/sync';
import type { SkillPortability } from '$lib/services/skills/manifest';
import type { SkillEditorStore } from '$lib/stores/skills/editor.svelte';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import type { EditorSessionController } from '$lib/controllers/workspace/editor-session';
export interface SkillEditorBuffer {
	readonly description: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
}
export type SkillEditorOutcome =
	| { readonly kind: 'complete' | 'superseded' }
	| { readonly kind: 'failure' | 'info' | 'success'; readonly message: string };
export interface SkillEditorFiles {
	import(input: {
		readonly noteId: NoteId;
		readonly raw: string;
		readonly baseRevision: number;
	}): Promise<void>;
	download(content: string, filename: string): void;
}
export interface SkillEditorWorkspace {
	readonly active: boolean;
	synchronize(): Promise<SessionSynchronization>;
	skill(): WorkspaceSkill | null;
}
export interface SkillEditorController {
	readonly note: Note;
	readonly savedDescription: string;
	readonly epoch: number;
	readonly dirty: boolean;
	readonly saving: boolean;
	readonly failure: string | null;
	readonly importing: boolean;
	readonly exporting: boolean;
	readonly unsynced: boolean;
	readonly status: {
		readonly kind: 'metadata' | 'document';
		readonly value: DraftStatus;
		readonly error: string | undefined;
	};
	readonly conflict: WriteConflictView<Note> | undefined;
	initialize(): void;
	changed(): void;
	rename(title: string): void;
	save(options?: { readonly auto?: boolean }): Promise<SkillEditorOutcome>;
	retry(): Promise<SkillEditorOutcome>;
	useRemote(): Promise<void>;
	keepLocal(): Promise<void>;
	export(): Promise<SkillEditorOutcome>;
	import(file: { text(): Promise<string> }): Promise<SkillEditorOutcome>;
	close(): void;
}
export class SkillEditor implements SkillEditorController {
	constructor(
		private readonly state: SkillEditorStore,
		private readonly draft: WorkspaceDraftController<'notes'>,
		private readonly metadata: WorkspaceDraftController<'skills'>,
		private readonly edits: EditorSessionController,
		private readonly workspace: SkillEditorWorkspace,
		private readonly buffer: () => SkillEditorBuffer | undefined,
		private readonly portability: SkillPortability,
		private readonly files: SkillEditorFiles,
		private readonly scheduler: SyncScheduler
	) {}
	get note(): Note {
		return this.state.read().note;
	}
	get savedDescription(): string {
		return this.state.read().savedDescription;
	}
	get epoch(): number {
		return this.state.read().epoch;
	}
	get dirty(): boolean {
		return this.edits.dirty;
	}
	get saving(): boolean {
		return this.edits.saving;
	}
	get failure(): string | null {
		return this.edits.failure;
	}
	get importing(): boolean {
		return this.state.read().importing;
	}
	get exporting(): boolean {
		return this.state.read().exporting;
	}
	get unsynced(): boolean {
		return [this.draft.status, this.metadata.status].some((status) => status !== 'synced');
	}
	get conflict(): WriteConflictView<Note> | undefined {
		return this.draft.conflict;
	}
	get status(): SkillEditorController['status'] {
		const drafts = [this.draft, this.metadata];
		const selected =
			drafts.find((item) => item.status === 'conflict') ??
			drafts.find((item) => item.status === 'error') ??
			drafts.find((item) => item.status !== 'synced') ??
			this.draft;
		return {
			kind: selected === this.metadata ? 'metadata' : 'document',
			value: selected.status,
			error: selected.lastError
		};
	}
	private get active(): boolean {
		return (
			!this.state.read().closed &&
			this.workspace.active &&
			this.draft.active &&
			this.metadata.active
		);
	}
	initialize(): void {
		this.draft.adopt();
		this.metadata.adopt();
	}
	changed(): void {
		if (!this.active) return;
		this.edits.changed();
		this.cancelTimer();
		this.state.setScheduled(
			this.scheduler.schedule(this.scheduler.now() + 2000, async () => {
				await this.save({ auto: true });
			})
		);
	}
	rename(title: string): void {
		if (!this.active || !title || title === this.note.title) return;
		this.state.update({ note: { ...this.note, title } });
		this.changed();
	}
	async save(options: { readonly auto?: boolean } = {}): Promise<SkillEditorOutcome> {
		if (!this.active) return { kind: 'superseded' };
		if (!this.buffer()) return { kind: 'complete' };
		if (!this.dirty) return !options.auto && this.unsynced ? this.retry() : { kind: 'complete' };
		this.cancelTimer();
		await this.edits.save(
			() => this.persist(),
			(value, unchanged) => {
				if (!this.active) return;
				this.state.update({
					note: unchanged
						? { ...value }
						: { ...this.note, currentRevision: value.currentRevision, updatedAt: value.updatedAt }
				});
			}
		);
		if (!this.active) return { kind: 'superseded' };
		return this.failure && !options.auto
			? { kind: 'failure', message: this.failure }
			: { kind: 'complete' };
	}
	private async persist(): Promise<EditorSave<Note>> {
		const input = this.buffer();
		if (!input) return { kind: 'failure', message: 'The editor is unavailable' };
		const details = this.metadata.value;
		if (!details)
			return { kind: 'failure', message: 'The skill details are unavailable. Reopen the skill.' };
		const description = input.description.trim();
		const note = this.note;
		if (description !== this.savedDescription) {
			const result = await this.metadata.stage({
				kind: 'updateSkill',
				noteId: details.noteId,
				description
			});
			if (!this.active) return { kind: 'failure', message: 'The skill editor is no longer active' };
			if (result.kind === 'failure') return result;
			if (!result.value) return { kind: 'failure', message: 'The skill no longer exists' };
			this.state.update({ savedDescription: result.value.description });
		}
		const result = await this.draft.stage({
			kind: 'saveNote',
			noteId: note.id,
			title: note.title,
			isPinned: note.isPinned,
			document: input.document,
			plainText: input.plainText
		});
		if (result.kind === 'failure') return result;
		return result.value
			? { kind: 'saved', value: result.value }
			: { kind: 'failure', message: 'The skill no longer exists' };
	}
	async retry(): Promise<SkillEditorOutcome> {
		if (!this.active) return { kind: 'superseded' };
		const current = this.edits.checkpoint();
		await Promise.all([this.draft.retry(), this.metadata.retry()]);
		if (!this.active) return { kind: 'superseded' };
		const local = this.draft.value;
		if (!local)
			return { kind: 'failure', message: this.draft.lastError ?? 'This resource is unavailable' };
		if (current() && !this.dirty) this.state.update({ note: { ...local } });
		return this.draft.lastError
			? { kind: 'failure', message: this.draft.lastError }
			: { kind: 'complete' };
	}
	async useRemote(): Promise<void> {
		if (!this.active) return;
		const remote = await this.draft.discard(this.edits.checkpoint());
		if (!this.active || remote.kind === 'superseded') return;
		if (remote.kind !== 'ready') throw new Error('The server copy is unavailable');
		this.state.update({ note: { ...remote.value }, epoch: this.epoch + 1 });
		this.edits.accept();
	}
	async keepLocal(): Promise<void> {
		if (!this.active) return;
		const current = this.edits.checkpoint();
		await this.draft.keep();
		if (!this.active || !current() || this.dirty) return;
		const local = this.draft.value;
		if (!local) throw new Error('The local edit is unavailable');
		this.state.update({ note: { ...local }, epoch: this.epoch + 1 });
	}
	private async ensureSynchronized(message: string): Promise<SkillEditorOutcome> {
		if (this.dirty) await this.save({ auto: true });
		if (!this.active) return { kind: 'superseded' };
		return this.dirty || this.unsynced ? { kind: 'failure', message } : { kind: 'complete' };
	}
	async export(): Promise<SkillEditorOutcome> {
		if (!this.active || this.exporting) return { kind: 'superseded' };
		this.state.update({ exporting: true });
		try {
			const ready = await this.ensureSynchronized('Save the skill before exporting.');
			if (ready.kind !== 'complete') return ready;
			const sync = await this.workspace.synchronize();
			if (!this.active || sync.kind === 'stopped') return { kind: 'superseded' };
			if (sync.kind === 'failure') return sync;
			const skill = this.workspace.skill();
			if (!skill) return { kind: 'failure', message: 'The skill no longer exists' };
			const prepared = this.portability.export({
				...skill,
				instructions: this.note.plainText
			});
			this.files.download(prepared.content, prepared.filename);
			return { kind: 'complete' };
		} catch (error) {
			if (!this.active) return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Skill could not be exported'
			};
		} finally {
			this.state.update({ exporting: false });
		}
	}
	async import(file: { text(): Promise<string> }): Promise<SkillEditorOutcome> {
		if (!this.active) return { kind: 'superseded' };
		this.state.update({ importing: true });
		try {
			const ready = await this.ensureSynchronized(
				'Save and synchronize the skill before importing.'
			);
			if (ready.kind !== 'complete') return ready;
			const current = this.edits.checkpoint();
			const raw = await file.text();
			if (!this.active) return { kind: 'superseded' };
			if (!current())
				return { kind: 'failure', message: 'Save the latest edits before importing.' };
			await this.files.import({
				noteId: this.note.id,
				raw,
				baseRevision: this.note.currentRevision
			});
			if (!this.active) return { kind: 'superseded' };
			const sync = await this.workspace.synchronize();
			if (!this.active || sync.kind === 'stopped') return { kind: 'superseded' };
			if (sync.kind === 'failure') return sync;
			const [opened, details] = await Promise.all([
				this.draft.read(current),
				this.metadata.read(current)
			]);
			if (!this.active) return { kind: 'superseded' };
			if (opened.kind === 'superseded' || details.kind === 'superseded')
				return {
					kind: 'info',
					message: 'The import completed. Your later edits are retained for review.'
				};
			if (opened.kind !== 'ready' || details.kind !== 'ready')
				throw new Error('The imported skill could not be reopened');
			this.state.update({
				note: { ...opened.value },
				savedDescription: details.value.description,
				epoch: this.epoch + 1
			});
			this.edits.accept();
			return { kind: 'success', message: 'Skill imported' };
		} catch (error) {
			if (!this.active) return { kind: 'superseded' };
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'That file is not a valid SKILL.md'
			};
		} finally {
			this.state.update({ importing: false });
		}
	}
	private cancelTimer(): void {
		this.state.scheduled?.();
		this.state.setScheduled(undefined);
	}
	close(): void {
		this.cancelTimer();
		this.state.update({ closed: true });
		this.edits.close();
	}
}
