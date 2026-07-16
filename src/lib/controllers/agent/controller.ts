import type {
	ActorContext,
	AgentEvent,
	Conversation,
	ConversationId,
	DecideAgentRunInput,
	Message,
	RunAgentInput
} from '$lib/models';
import type {
	AgentContextBuilder,
	AgentRunner,
	AgentModelCatalog,
	AgentPreferencesStore,
	AgentRunStore,
	ConversationJournal,
	ProvenanceRecorder
} from '$lib/services';
import { resolveAgentExecutionMode, resolveAgentModel } from '$lib/services';

export interface AgentController {
	run(actor: ActorContext, input: RunAgentInput, signal?: AbortSignal): AsyncIterable<AgentEvent>;
	listSessions(actor: ActorContext): Promise<readonly Conversation[]>;
	getSession(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<{ conversation: Conversation; messages: readonly Message[] }>;
	decide(
		actor: ActorContext,
		input: DecideAgentRunInput,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent>;
}

export interface AgentDependencies {
	contextBuilder: AgentContextBuilder;
	agentRunner: AgentRunner;
	conversationJournal: ConversationJournal;
	provenanceRecorder: ProvenanceRecorder;
	preferences: AgentPreferencesStore;
	models: AgentModelCatalog;
	runStore: AgentRunStore;
	defaultModel: string;
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

	async *run(
		actor: ActorContext,
		input: RunAgentInput,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent> {
		if (input.modelOverride) await this.dependencies.models.assertSelectable(input.modelOverride);
		const conversation = await this.dependencies.conversationJournal.getOrCreate(actor, input);
		const preferences = await this.dependencies.preferences.get(actor);
		const model = resolveAgentModel(conversation, preferences, this.dependencies.defaultModel);
		const executionMode = resolveAgentExecutionMode(conversation, preferences);
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
			model,
			metadata: { conversationId: conversation.id, executionMode }
		});
		const baseContext = await this.dependencies.contextBuilder.build(actor, effectiveInput, {
			provenanceId: provenance.id
		});
		const context = {
			...baseContext,
			conversationId: conversation.id,
			effectiveModel: model,
			executionMode,
			provenanceId: provenance.id
		};
		let assistantText = '';
		let completed = false;
		for await (const event of this.dependencies.agentRunner.run(
			actor,
			effectiveInput,
			context,
			signal
		)) {
			if (event.type === 'text_delta') assistantText += event.text;
			if (event.type === 'tool_started')
				await this.dependencies.conversationJournal.recordToolActivity(actor, conversation.id, {
					callId: event.callId,
					name: event.name,
					input: event.arguments,
					status: 'running'
				});
			if (event.type === 'tool_completed') {
				await this.dependencies.conversationJournal.recordToolActivity(actor, conversation.id, {
					callId: event.callId,
					name: event.name,
					input: {},
					output: event.output,
					failure: event.failure,
					status: event.failure ? 'failed' : 'succeeded'
				});
				yield event;
				yield { type: 'resources_stale' as const, resources: [event.name] };
				continue;
			}
			if (event.type === 'approval_required')
				await this.dependencies.conversationJournal.recordToolActivity(actor, conversation.id, {
					callId: event.callId,
					name: event.name,
					input: event.arguments,
					status: 'approval_required'
				});
			if (event.type === 'completed') {
				await this.dependencies.conversationJournal.recordAssistantText(
					actor,
					conversation.id,
					assistantText,
					model
				);
				completed = true;
				yield { ...event, conversationId: conversation.id, model };
				continue;
			}
			yield event;
		}
		if (!completed && assistantText)
			await this.dependencies.conversationJournal.recordAssistantText(
				actor,
				conversation.id,
				assistantText,
				model
			);
	}

	async *decide(
		actor: ActorContext,
		input: DecideAgentRunInput,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent> {
		const run = await this.dependencies.runStore.get(actor, input.runId);
		const pending = run.pendingDecisions.find((item) => item.callId === input.callId);
		if (!pending) throw new Error('The pending tool call was not found');
		await this.dependencies.conversationJournal.recordToolActivity(actor, run.conversationId, {
			callId: input.callId,
			name: pending.toolName,
			input: pending.arguments,
			decision: input.decision === 'approve' ? 'approved' : 'rejected',
			status: input.decision === 'approve' ? 'running' : 'rejected'
		});
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'agent',
			producerName: 'Workbench Agent',
			pipeline: 'agent',
			runId: run.id,
			model: run.model,
			metadata: { conversationId: run.conversationId, resumed: true }
		});
		let assistantText = '';
		for await (const event of this.dependencies.agentRunner.resume(
			actor,
			input,
			{ ...(run.contextSnapshot ?? {}), provenanceId: provenance.id },
			signal
		)) {
			if (event.type === 'text_delta') assistantText += event.text;
			if (event.type === 'tool_started')
				await this.dependencies.conversationJournal.recordToolActivity(actor, run.conversationId, {
					callId: event.callId,
					name: event.name,
					input: event.arguments,
					status: 'running'
				});
			if (event.type === 'tool_completed')
				await this.dependencies.conversationJournal.recordToolActivity(actor, run.conversationId, {
					callId: event.callId,
					name: event.name,
					input: {},
					output: event.output,
					failure: event.failure,
					status: event.failure ? 'failed' : 'succeeded'
				});
			if (event.type === 'approval_required')
				await this.dependencies.conversationJournal.recordToolActivity(actor, run.conversationId, {
					callId: event.callId,
					name: event.name,
					input: event.arguments,
					status: 'approval_required'
				});
			if (event.type === 'completed' && assistantText)
				await this.dependencies.conversationJournal.recordAssistantText(
					actor,
					run.conversationId,
					assistantText,
					run.model
				);
			yield event;
			if (event.type === 'tool_completed')
				yield { type: 'resources_stale' as const, resources: [event.name] };
		}
	}
}
