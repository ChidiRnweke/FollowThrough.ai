import type {
	ActorContext,
	AgentEvent,
	Conversation,
	ConversationId,
	ExtractPromisesOutput,
	FindReferencesOutput,
	GenerateMermaidDiagramOutput,
	Message,
	ProvenanceId,
	RelateSelectionOutput,
	RunAgentInput,
	DecideAgentRunInput,
	TextSelection,
	ToolActivity
} from '$lib/models';

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
		context: Readonly<Record<string, unknown>>,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent>;
	resume(
		actor: ActorContext,
		input: DecideAgentRunInput,
		context: Readonly<Record<string, unknown>>,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent>;
}
export interface ConversationRecorder {
	getOrCreate(actor: ActorContext, input: RunAgentInput): Promise<Conversation>;
}

export interface ConversationJournal extends ConversationRecorder {
	listConversations(actor: ActorContext): Promise<readonly Conversation[]>;
	createWorkflow(
		actor: ActorContext,
		input: { title: string; contextNoteId?: import('$lib/models').NoteId }
	): Promise<Conversation>;
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
