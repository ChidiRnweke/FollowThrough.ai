import type { ActorContext, NoteId, Skill, SkillSummary, SkillUsage } from '../models';
export interface SkillRepository {
	findByNoteId(actor: ActorContext, noteId: NoteId): Promise<Skill | undefined>;
	listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]>;
	insert(actor: ActorContext, skill: Skill): Promise<Skill>;
	update(actor: ActorContext, skill: Skill): Promise<Skill>;
	recordUsage(actor: ActorContext, usage: SkillUsage): Promise<SkillUsage>;
	listUsages(actor: ActorContext, noteId: NoteId): Promise<readonly SkillUsage[]>;
}
