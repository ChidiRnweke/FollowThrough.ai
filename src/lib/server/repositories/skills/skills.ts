import type { Note } from '$lib/models/notes';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Skill, SkillSummary, SkillUsage } from '$lib/models/skills';
/** Skills are notes with metadata, so `insert`/`update` operate on the metadata row only; the note body goes through the notes repository. */
export interface SkillRepository {
	/** Serialize catalog name decisions and built-in installation until the transaction ends. */
	lockCatalog(): Promise<void>;
	findForWrite(noteId: NoteId): Promise<Skill<Note> | undefined>;
	findByNoteId(noteId: NoteId): Promise<Skill<Note> | undefined>;
	listEnabled(projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	listAll(projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	setPinned(noteId: NoteId, projectId: ProjectId, pinned: boolean): Promise<void>;
	insert(skill: Skill<Note>): Promise<Skill<Note>>;
	update(skill: Skill<Note>): Promise<Skill<Note>>;
	recordUsage(usage: SkillUsage): Promise<SkillUsage>;
	listUsages(noteId: NoteId): Promise<readonly SkillUsage[]>;
}
