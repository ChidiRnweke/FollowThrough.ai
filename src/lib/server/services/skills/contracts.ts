import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ProjectId } from '$lib/models/projects';
import type {
	Skill,
	SkillSummary,
	SkillUsageView,
	SkillManifest,
	SkillEditInput,
	PreparedSkillEdit
} from '$lib/models/skills';

export interface SkillCreator {
	create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill<Note>>;
}
export interface SkillFinder {
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	load(actor: ActorContext, noteId: NoteId): Promise<Skill<Note>>;
}

export interface SkillEditor {
	prepareEdit(
		actor: ActorContext,
		current: Skill<Note>,
		input: Omit<SkillEditInput, 'noteId'>
	): Promise<PreparedSkillEdit<Note>>;
	commitEdit(actor: ActorContext, skill: Skill<Note>): Promise<Skill<Note>>;
	manifest(actor: ActorContext, noteId: NoteId): Promise<SkillManifest>;
	setPinned(
		actor: ActorContext,
		noteId: NoteId,
		projectId: ProjectId,
		pinned: boolean
	): Promise<void>;
}
export interface SkillUsageRecorder {
	record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void>;
}
export interface SkillUsageLister {
	list(actor: ActorContext, skillNoteId: NoteId): Promise<readonly SkillUsageView[]>;
}
export interface BuiltInSkillProvisioner {
	ensure(actor: ActorContext): Promise<void>;
	load(actor: ActorContext, key: string): Promise<Skill<Note>>;
}
