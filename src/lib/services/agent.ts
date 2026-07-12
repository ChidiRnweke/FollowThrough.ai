import type {
	ActorContext,
	AgentEvent,
	Conversation,
	ConversationId,
	ExtractPromisesOutput,
	FindReferencesOutput,
	GenerateMermaidDiagramOutput,
	Note,
	NoteId,
	Message,
	ProvenanceId,
	RelateSelectionOutput,
	RunAgentInput,
	Skill,
	SkillSummary,
	SkillUsageView,
	TextSelection,
	ToolActivity
} from '../models';

export interface AgentWorkflowToolbox {
	extractPromises(actor: ActorContext, selection: TextSelection): Promise<ExtractPromisesOutput>;
	relate(actor: ActorContext, selection: TextSelection): Promise<RelateSelectionOutput>;
	reference(actor: ActorContext, selection: TextSelection): Promise<FindReferencesOutput>;
	generateDiagram(
		actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<GenerateMermaidDiagramOutput>;
}
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
	record(
		actor: ActorContext,
		input: { skillNoteId: NoteId; contextNoteId?: NoteId; provenanceId: ProvenanceId }
	): Promise<void>;
}
export interface SkillUsageLister {
	list(actor: ActorContext, skillNoteId: NoteId): Promise<readonly SkillUsageView[]>;
}
export interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId }
	): Promise<Readonly<Record<string, unknown>>>;
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

export interface ConversationJournal extends ConversationRecorder {
	listConversations(actor: ActorContext): Promise<readonly Conversation[]>;
	get(actor: ActorContext, conversationId: ConversationId): Promise<Conversation>;
	listMessages(actor: ActorContext, conversationId: ConversationId): Promise<readonly Message[]>;
	recordUserPrompt(
		actor: ActorContext,
		conversationId: ConversationId,
		prompt: string
	): Promise<void>;
	recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string
	): Promise<void>;
	recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity
	): Promise<void>;
}
