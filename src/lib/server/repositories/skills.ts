import type { ActorContext, NoteId, ProjectId, Skill, SkillSummary, SkillUsage } from '$lib/models';
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
