import type {
	ActorContext,
	AgentEvent,
	Conversation,
	ConversationId,
	Message,
	RunAgentInput
} from '$lib/models';
import type {
	AgentContextBuilder,
	AgentRunner,
	ConversationJournal,
	ProvenanceRecorder
} from '$lib/services';

export interface AgentController {
	run(actor: ActorContext, input: RunAgentInput): AsyncIterable<AgentEvent>;
	listSessions(actor: ActorContext): Promise<readonly Conversation[]>;
	getSession(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<{ conversation: Conversation; messages: readonly Message[] }>;
}

export interface AgentDependencies {
	contextBuilder: AgentContextBuilder;
	agentRunner: AgentRunner;
	conversationJournal: ConversationJournal;
	provenanceRecorder: ProvenanceRecorder;
}

export class DefaultAgentController implements AgentController {
	constructor(private readonly dependencies: AgentDependencies) {}

	listSessions(actor: ActorContext): Promise<readonly Conversation[]> {
		return this.dependencies.conversationJournal.listConversations(actor);
	}

	async getSession(actor: ActorContext, conversationId: ConversationId) {
		const [conversation, messages] = await Promise.all([
			this.dependencies.conversationJournal.get(actor, conversationId),
			this.dependencies.conversationJournal.listMessages(actor, conversationId)
		]);
		return { conversation, messages };
	}

	async *run(actor: ActorContext, input: RunAgentInput): AsyncIterable<AgentEvent> {
		const conversation = await this.dependencies.conversationJournal.getOrCreate(actor, input);
		const effectiveInput = { ...input, conversationId: conversation.id };
		await this.dependencies.conversationJournal.recordUserPrompt(
			actor,
			conversation.id,
			input.prompt
		);
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'agent',
			producerName: 'Workbench Agent',
			pipeline: 'agent',
			metadata: { conversationId: conversation.id }
		});
		const [context, messages] = await Promise.all([
			this.dependencies.contextBuilder.build(actor, effectiveInput, {
				provenanceId: provenance.id
			}),
			this.dependencies.conversationJournal.listMessages(actor, conversation.id)
		]);
		let assistantText = '';
		let completed = false;
		for await (const event of this.dependencies.agentRunner.run(actor, effectiveInput, {
			...context,
			conversationHistory: messages
		})) {
			if (event.type === 'text_delta') assistantText += event.text;
			if (event.type === 'tool_started')
				await this.dependencies.conversationJournal.recordToolActivity(actor, conversation.id, {
					name: event.name,
					input: {},
					status: 'running'
				});
			if (event.type === 'tool_completed')
				await this.dependencies.conversationJournal.recordToolActivity(actor, conversation.id, {
					name: event.name,
					input: {},
					status: 'succeeded'
				});
			if (event.type === 'completed') {
				await this.dependencies.conversationJournal.recordAssistantText(
					actor,
					conversation.id,
					assistantText
				);
				completed = true;
				yield { type: 'completed', conversationId: conversation.id };
				continue;
			}
			yield event;
		}
		if (!completed && assistantText)
			await this.dependencies.conversationJournal.recordAssistantText(
				actor,
				conversation.id,
				assistantText
			);
	}
}
