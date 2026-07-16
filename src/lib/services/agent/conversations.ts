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

	listConversations(actor: ActorContext): Promise<readonly Conversation[]> {
		return this.repository.list(actor, 'chat');
	}

	createWorkflow(
		actor: ActorContext,
		input: { title: string; contextNoteId?: import('$lib/models').NoteId }
	): Promise<Conversation> {
		const timestamp = now();
		return this.repository.insert(actor, {
			id: crypto.randomUUID() as ConversationId,
			userId: actor.userId,
			kind: 'workflow',
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

	async recordUserPrompt(
		actor: ActorContext,
		conversationId: ConversationId,
		prompt: string
	): Promise<void> {
		await this.append(actor, conversationId, 'user', { type: 'text', text: prompt });
	}

	async recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string
	): Promise<void> {
		await this.append(actor, conversationId, 'assistant', { type: 'text', text }, model);
	}

	async recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity
	): Promise<void> {
		await this.append(actor, conversationId, 'tool', {
			type: 'tool_activity',
			callId: activity.callId,
			name: activity.name,
			input: activity.input,
			output: activity.output ?? null,
			failure: activity.failure ?? null,
			decision: activity.decision ?? null,
			status: activity.status
		});
	}

	private async append(
		actor: ActorContext,
		conversationId: ConversationId,
		role: Message['role'],
		content: Readonly<Record<string, unknown>>,
		model?: string
	): Promise<void> {
		await this.repository.appendMessage(actor, {
			id: crypto.randomUUID() as MessageId,
			conversationId,
			role,
			content,
			...(model ? { model } : {}),
			createdAt: now()
		});
	}
}
