import type {
	ActorContext,
	Note,
	NoteId,
	ProvenanceId,
	Skill,
	SkillSummary,
	SkillUsageView,
	TextSelection
} from '$lib/models';

export interface SkillCreator {
	create(
		actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill>;
	createFromSelection(
		actor: ActorContext,
		selection: TextSelection,
		input: {
			name: string;
			description: string;
			triggerHints: readonly string[];
			provenanceId: ProvenanceId;
		}
	): Promise<Skill>;
}
export interface SkillFinder {
	listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]>;
	load(actor: ActorContext, noteId: NoteId): Promise<Skill>;
}
export interface RelevantSkillSelector {
	select(
		actor: ActorContext,
		prompt: string,
		skills: readonly SkillSummary[]
	): Promise<readonly SkillSummary[]>;
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
