import type {
	ActorContext,
	AgentEvent,
	AgentRunId,
	Conversation,
	ConversationId,
	DecideAgentRunInput,
	Message,
	RunAgentInput
} from '$lib/models';
import { ValidationError } from '$lib/models';
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
	listSessions(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]>;
	renameSession(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation>;
	deleteSession(actor: ActorContext, conversationId: ConversationId): Promise<void>;
	getSession(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<{ conversation: Conversation; messages: readonly Message[] }>;
	decide(
		actor: ActorContext,
		input: DecideAgentRunInput,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent>;
	retry(actor: ActorContext, runId: AgentRunId, signal?: AbortSignal): AsyncIterable<AgentEvent>;
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

	listSessions(
		actor: ActorContext,
		options?: { readonly limit?: number; readonly offset?: number; readonly query?: string }
	): Promise<readonly Conversation[]> {
		return this.dependencies.conversationJournal.listConversations(actor, options);
	}

	renameSession(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation> {
		return this.dependencies.conversationJournal.rename(actor, conversationId, title);
	}

	async deleteSession(actor: ActorContext, conversationId: ConversationId): Promise<void> {
		const latest = await this.dependencies.runStore
			.getLatestForConversation(actor, conversationId)
			.catch(() => undefined);
		if (latest?.status === 'running' || latest?.status === 'awaiting_approval')
			throw new ValidationError('Stop or resolve the active agent run before deleting this chat');
		await this.dependencies.conversationJournal.remove(actor, conversationId);
	}

	async getSession(actor: ActorContext, conversationId: ConversationId) {
		const [conversation, messages] = await Promise.all([
			this.dependencies.conversationJournal.get(actor, conversationId),
			this.dependencies.conversationJournal.listMessages(actor, conversationId)
		]);
		const latestRun = await this.dependencies.runStore
			.getLatestForConversation(actor, conversationId)
			.catch(() => undefined);
		return {
			conversation,
			messages,
			...(latestRun
				? {
						latestRun: {
							id: latestRun.id,
							status: latestRun.status,
							failure: latestRun.failure
						}
					}
				: {})
		};
	}

	async *run(
		actor: ActorContext,
		input: RunAgentInput,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent> {
		yield* this.executeRun(actor, input, true, signal);
	}

	async *retry(
		actor: ActorContext,
		runId: AgentRunId,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent> {
		const run = await this.dependencies.runStore.get(actor, runId);
		if (run.status !== 'failed') throw new ValidationError('Only failed runs can be retried');
		const input = run.inputSnapshot as RunAgentInput | undefined;
		if (!input?.prompt) throw new ValidationError('The original request is unavailable');
		yield* this.executeRun(actor, { ...input, conversationId: run.conversationId }, false, signal);
	}

	private async *executeRun(
		actor: ActorContext,
		input: RunAgentInput,
		recordPrompt: boolean,
		signal?: AbortSignal
	): AsyncIterable<AgentEvent> {
		if (input.modelOverride) await this.dependencies.models.assertSelectable(input.modelOverride);
		const conversation = await this.dependencies.conversationJournal.getOrCreate(actor, input);
		const preferences = await this.dependencies.preferences.get(actor);
		const model = resolveAgentModel(conversation, preferences, this.dependencies.defaultModel);
		const executionMode = resolveAgentExecutionMode(conversation, preferences);
		const effectiveInput = { ...input, conversationId: conversation.id };
		if (recordPrompt)
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
