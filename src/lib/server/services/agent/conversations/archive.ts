import type { ActorContext } from '$lib/models/identity';
import type {
	AgentRunId,
	Conversation,
	ConversationId,
	ConversationImageInput,
	Message,
	MessageId,
	StagedAgentRunInput,
	ToolActivity
} from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError } from '$lib/errors';
import type { ConversationRepository } from '$lib/server/repositories/agent';

const now = (): DateTime => new Date().toISOString() as DateTime;

/**
 * Journal-safe projection of user images. The input interface has no index
 * signature, so the wire type would not take it; the values are plain JSON and
 * the projection says so without a cast.
 */
const imagePayloads = (images: readonly ConversationImageInput[]): AgentPayloadObject[] =>
	images.map((image) => ({
		id: image.id,
		mediaType: image.mediaType,
		dataUrl: image.dataUrl,
		name: image.name
	}));

export class ConversationArchive {
	constructor(private readonly repository: ConversationRepository) {}

	async getOrCreate(actor: ActorContext, input: StagedAgentRunInput): Promise<Conversation> {
		if (input.conversationId) {
			const existing = await this.repository.findById(actor, input.conversationId);
			if (!existing) throw new NotFoundError('Conversation was not found');
			if (
				input.modelOverride === undefined &&
				input.visionModelOverride === undefined &&
				input.executionModeOverride === undefined
			)
				return existing;
			return this.repository.update(actor, {
				...existing,
				...(input.modelOverride === null
					? { modelOverride: undefined }
					: input.modelOverride !== undefined
						? { modelOverride: input.modelOverride }
						: {}),
				...(input.visionModelOverride === null
					? { visionModelOverride: undefined }
					: input.visionModelOverride !== undefined
						? { visionModelOverride: input.visionModelOverride }
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
			...(input.visionModelOverride ? { visionModelOverride: input.visionModelOverride } : {}),
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
			contextProjectId?: ProjectId;
			contextNoteId?: NoteId;
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
		runId?: AgentRunId,
		images?: readonly ConversationImageInput[]
	): Promise<void> {
		// Two arms rather than a conditional spread: an absent key must not be
		// spelled as `images: undefined`, which the wire type cannot carry.
		const content: AgentPayloadObject =
			images && images.length > 0
				? { type: 'text', text: prompt, images: imagePayloads(images) }
				: { type: 'text', text: prompt };
		await this.append(actor, conversationId, 'user', content, undefined, {
			runId
		});
	}

	async recordAssistantText(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
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

	/**
	 * The agent's own thinking, kept apart from what it said. Reasoning was streamed and then
	 * dropped on the floor, so reopening a conversation lost it entirely — the reader saw
	 * conclusions with the working erased.
	 */
	async recordAssistantReasoning(
		actor: ActorContext,
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.append(
			actor,
			conversationId,
			'assistant',
			{ type: 'reasoning', text },
			model,
			provenance
		);
	}

	/**
	 * Journal a tool outcome as a `tool_activity` message row, settling `output`
	 * and `failure` from the arm of the activity that can carry them.
	 */
	async recordToolActivity(
		actor: ActorContext,
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		// `callId` and the failed/succeeded payloads are spelled as explicit `null`
		// because the wire type cannot carry `undefined`: absent is a different
		// fact from `null` here only for callId, and the client already reads
		// `String(callId ?? '')`, so the two spell the same thing on replay.
		const content: AgentPayloadObject = {
			type: 'tool_activity',
			callId: activity.callId ?? null,
			name: activity.name,
			input: activity.input,
			// Read off the arm that can have it. `decision` is gone: no writer ever
			// set it, so every row ever journalled carried its `null`.
			// A succeeded call with no output journals `null` rather than raising:
			// a tool that returned nothing settles as `providerToolOutput`'s
			// `none` kind and reaches here output-absent, which is a normal
			// outcome. The value itself needs no reading here — `ToolActivity`
			// carries the wire type, read once where the tool result was produced.
			output:
				activity.status === 'succeeded' && activity.output !== undefined ? activity.output : null,
			failure: activity.status === 'failed' ? activity.failure : null,
			status: activity.status
		};
		await this.append(actor, conversationId, 'tool', content, undefined, provenance);
	}

	private async append(
		actor: ActorContext,
		conversationId: ConversationId,
		role: Message['role'],
		content: AgentPayloadObject,
		model?: string,
		provenance?: {
			readonly runId?: AgentRunId;
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
