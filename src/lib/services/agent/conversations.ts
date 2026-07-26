import type {
	ActorContext,
	Conversation,
	ConversationId,
	DateTime,
	Message,
	MessageId,
	RunAgentInput,
	ToolActivity
} from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { ConversationRepository } from '$lib/repositories';
import type { ConversationJournal } from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class PersistentConversationJournal implements ConversationJournal {
	constructor(private readonly repository: ConversationRepository) {}

	async getOrCreate(actor: ActorContext, input: RunAgentInput): Promise<Conversation> {
		if (input.conversationId) {
			const existing = await this.repository.findById(actor, input.conversationId);
			if (!existing) throw new NotFoundError('Conversation was not found');
			if (input.modelOverride === undefined && input.executionModeOverride === undefined)
				return existing;
			return this.repository.update(actor, {
				...existing,
				...(input.modelOverride === null
					? { modelOverride: undefined }
					: input.modelOverride !== undefined
						? { modelOverride: input.modelOverride }
						: {}),
				...(input.executionModeOverride === null
					? { executionModeOverride: undefined }
					: input.executionModeOverride !== undefined
						? { executionModeOverride: input.executionModeOverride }
						: {}),
				updatedAt: now()
			});
		}
		const timestamp = now();
		return this.repository.insert(actor, {
			id: crypto.randomUUID() as ConversationId,
			userId: actor.userId,
			kind: 'chat',
			contextProjectId: input.projectId,
			contextNoteId: input.noteId,
			title: input.prompt.trim().slice(0, 80) || 'New conversation',
			...(input.modelOverride ? { modelOverride: input.modelOverride } : {}),
			...(input.executionModeOverride
				? { executionModeOverride: input.executionModeOverride }
				: {}),
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	listConversations(
		actor: ActorContext,
		options: { readonly limit?: number; readonly offset?: number; readonly query?: string } = {}
	): Promise<readonly Conversation[]> {
		return this.repository.list(actor, { kind: 'chat', ...options });
	}

	async rename(
		actor: ActorContext,
		conversationId: ConversationId,
		title: string
	): Promise<Conversation> {
		const conversation = await this.get(actor, conversationId);
		return this.repository.update(actor, {
			...conversation,
			title: title.trim(),
			updatedAt: now()
		});
	}

	remove(actor: ActorContext, conversationId: ConversationId): Promise<void> {
		return this.repository.delete(actor, conversationId);
	}

	createWorkflow(
		actor: ActorContext,
		input: {
			title: string;
			contextProjectId?: import('$lib/models').ProjectId;
			contextNoteId?: import('$lib/models').NoteId;
		}
	): Promise<Conversation> {
		const timestamp = now();
		return this.repository.insert(actor, {
			id: crypto.randomUUID() as ConversationId,
			userId: actor.userId,
			kind: 'workflow',
			contextProjectId: input.contextProjectId,
			contextNoteId: input.contextNoteId,
			title: input.title,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	async get(actor: ActorContext, conversationId: ConversationId): Promise<Conversation> {
		const conversation = await this.repository.findById(actor, conversationId);
		if (!conversation) throw new NotFoundError('Conversation was not found');
		return conversation;
	}

	listMessages(actor: ActorContext, conversationId: ConversationId): Promise<readonly Message[]> {
		return this.repository.listMessages(actor, conversationId);
	}

	/**
	 * Drop the `ordinal`-th user turn and everything after it, counting user
	 * messages only. Tolerates an ordinal past the end: the caller derives it from
	 * a client transcript that may have moved on.
	 */
	async truncateFromUserMessage(
		actor: ActorContext,
		conversationId: ConversationId,
		ordinal: number
	): Promise<void> {
		if (ordinal < 1) return;
		const messages = await this.repository.listMessages(actor, conversationId);
		const anchor = messages.filter((message) => message.role === 'user')[ordinal - 1];
		if (!anchor) return;
		const from = messages.indexOf(anchor);
		await this.repository.deleteMessages(
			actor,
			conversationId,
			messages.slice(from).map((message) => message.id)
		);
	}

	async recordUserPrompt(
		actor: ActorContext,
		conversationId: ConversationId,
		prompt: string,
		runId?: import('$lib/models').AgentRunId
	): Promise<void> {
		await this.append(actor, conversationId, 'user', { type: 'text', text: prompt }, undefined, {
			runId
		});
	}

	async recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: import('$lib/models').AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.append(
			actor,
			conversationId,
			'assistant',
			{ type: 'text', text },
			model,
			provenance
		);
	}

	async recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: {
			readonly runId: import('$lib/models').AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.append(
			actor,
			conversationId,
			'tool',
			{
				type: 'tool_activity',
				callId: activity.callId,
				name: activity.name,
				input: activity.input,
				output: activity.output ?? null,
				failure: activity.failure ?? null,
				decision: activity.decision ?? null,
				status: activity.status
			},
			undefined,
			provenance
		);
	}

	private async append(
		actor: ActorContext,
		conversationId: ConversationId,
		role: Message['role'],
		content: Readonly<Record<string, unknown>>,
		model?: string,
		provenance?: {
			readonly runId?: import('$lib/models').AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.repository.appendMessage(actor, {
			id: crypto.randomUUID() as MessageId,
			conversationId,
			role,
			content,
			...(provenance?.runId ? { runId: provenance.runId } : {}),
			...(provenance?.eventCursor ? { eventCursor: provenance.eventCursor } : {}),
			...(model ? { model } : {}),
			createdAt: now()
		});
	}
}
