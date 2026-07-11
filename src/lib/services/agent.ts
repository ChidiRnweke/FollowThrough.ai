import type {
	ActorContext,
	AgentEvent,
	Conversation,
	Note,
	NoteId,
	ProvenanceId,
	RunAgentInput,
	Skill,
	SkillSummary,
	TextSelection
} from '../models';
export interface SkillCreator {
	create(
		actor: ActorContext,
		note: Note,
		input: {
			name: string;
			description: string;
			triggerHints: readonly string[];
		}
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
	record(actor: ActorContext, skillNoteId: NoteId, contextNoteId?: NoteId): Promise<void>;
}
export interface AgentContextBuilder {
	build(actor: ActorContext, input: RunAgentInput): Promise<Readonly<Record<string, unknown>>>;
}
export interface AgentRunner {
	run(
		actor: ActorContext,
		input: RunAgentInput,
		context: Readonly<Record<string, unknown>>
	): AsyncIterable<AgentEvent>;
}
export interface ConversationRecorder {
	getOrCreate(actor: ActorContext, input: RunAgentInput): Promise<Conversation>;
}
