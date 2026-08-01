import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { Skill, SkillSummary, SkillUsage } from '$lib/models/skills';
export interface SkillRepository {
	findByNoteId(actor: ActorContext, noteId: NoteId): Promise<Skill | undefined>;
	listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]>;
	setPinned(
		actor: ActorContext,
		noteId: NoteId,
		projectId: ProjectId,
		pinned: boolean
	): Promise<void>;
	insert(actor: ActorContext, skill: Skill): Promise<Skill>;
	update(actor: ActorContext, skill: Skill): Promise<Skill>;
	recordUsage(actor: ActorContext, usage: SkillUsage): Promise<SkillUsage>;
	listUsages(actor: ActorContext, noteId: NoteId): Promise<readonly SkillUsage[]>;
}
