import type { ActorContext } from '$lib/models/identity';
import type {
	AgentRunId,
	Conversation,
	ConversationId,
	ConversationImageInput,
	Message,
	MessageId,
	StoredMessage,
	StagedAgentRunInput,
	ToolActivity
} from '$lib/models/agent';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError } from '$lib/errors';
import type { ConversationRepository } from '$lib/server/repositories/agent';

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

/**
 * The value a settled call produced, off the arm that can carry one.
 *
 * `reported_failure` keeps its output: the failure string was read out of that
 * value, and the value is where the detail the model needs on its next attempt
 * lives (ADR 0035). Journalling it as a bare failure is what used to throw the
 * detail away.
 */
const toolActivityOutput = (activity: ToolActivity): AgentPayload => {
	if (activity.status === 'reported_failure') return activity.output;
	return activity.status === 'succeeded' && activity.output !== undefined ? activity.output : null;
};

export interface ConversationSessions {
	getOrCreate(input: StagedAgentRunInput): Promise<Conversation>;
	getForWrite(id: ConversationId): Promise<Conversation>;
	listConversations(options?: {
		readonly limit?: number;
		readonly offset?: number;
		readonly query?: string;
	}): Promise<readonly Conversation[]>;
	rename(conversationId: ConversationId, title: string): Promise<Conversation>;
	remove(conversationId: ConversationId): Promise<void>;
	createWorkflow(input: {
		title: string;
		contextProjectId?: ProjectId;
		contextNoteId?: NoteId;
	}): Promise<Conversation>;
	get(conversationId: ConversationId): Promise<Conversation>;
}
export interface ConversationMessages {
	listMessages(conversationId: ConversationId): Promise<readonly StoredMessage[]>;
	truncateFromUserMessage(conversationId: ConversationId, ordinal: number): Promise<void>;
	recordUserPrompt(
		conversationId: ConversationId,
		prompt: string,
		runId?: AgentRunId,
		images?: readonly ConversationImageInput[]
	): Promise<void>;
	recordAssistantText(
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
	recordAssistantReasoning(
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
	recordToolActivity(
		conversationId: ConversationId,
		activity: ToolActivity,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void>;
}
export class ConversationArchive implements ConversationSessions, ConversationMessages {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: ConversationRepository,
		private readonly now: () => DateTime
	) {}

	async getForWrite(id: ConversationId): Promise<Conversation> {
		const conversation = await this.repository.findForWrite(id);
		if (!conversation) throw new NotFoundError('Conversation was not found');
		return conversation;
	}

	async getOrCreate(input: StagedAgentRunInput): Promise<Conversation> {
		if (input.conversationId) {
			const existing = await this.repository.findForWrite(input.conversationId);
			if (!existing) throw new NotFoundError('Conversation was not found');
			if (
				input.modelOverride === undefined &&
				input.visionModelOverride === undefined &&
				input.executionModeOverride === undefined
			)
				return existing;
			return this.repository.update({
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
				updatedAt: this.now()
			});
		}
		const timestamp = this.now();
		return this.repository.insert({
			id: crypto.randomUUID() as ConversationId,
			userId: this.actor.userId,
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
		options: { readonly limit?: number; readonly offset?: number; readonly query?: string } = {}
	): Promise<readonly Conversation[]> {
		return this.repository.list({ kind: 'chat', ...options });
	}

	async rename(conversationId: ConversationId, title: string): Promise<Conversation> {
		const conversation = await this.get(conversationId);
		return this.repository.update({
			...conversation,
			title: title.trim(),
			updatedAt: this.now()
		});
	}

	remove(conversationId: ConversationId): Promise<void> {
		return this.repository.delete(conversationId);
	}

	createWorkflow(input: {
		title: string;
		contextProjectId?: ProjectId;
		contextNoteId?: NoteId;
	}): Promise<Conversation> {
		const timestamp = this.now();
		return this.repository.insert({
			id: crypto.randomUUID() as ConversationId,
			userId: this.actor.userId,
			kind: 'workflow',
			contextProjectId: input.contextProjectId,
			contextNoteId: input.contextNoteId,
			title: input.title,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	async get(conversationId: ConversationId): Promise<Conversation> {
		const conversation = await this.repository.findById(conversationId);
		if (!conversation) throw new NotFoundError('Conversation was not found');
		return conversation;
	}

	listMessages(conversationId: ConversationId): Promise<readonly StoredMessage[]> {
		return this.repository.listMessages(conversationId);
	}

	/**
	 * Drop the `ordinal`-th user turn and everything after it, counting user
	 * messages only. Tolerates an ordinal past the end: the caller derives it from
	 * a client transcript that may have moved on.
	 */
	async truncateFromUserMessage(conversationId: ConversationId, ordinal: number): Promise<void> {
		if (ordinal < 1) return;
		const messages = await this.repository.listMessages(conversationId);
		const anchor = messages.filter((message) => message.role === 'user')[ordinal - 1];
		if (!anchor) return;
		const from = messages.indexOf(anchor);
		await this.repository.deleteMessages(
			conversationId,
			messages.slice(from).map((message) => message.id)
		);
	}

	async recordUserPrompt(
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
		await this.append(conversationId, 'user', content, undefined, {
			runId
		});
	}

	async recordAssistantText(
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.append(conversationId, 'assistant', { type: 'text', text }, model, provenance);
	}

	/**
	 * The agent's own thinking, kept apart from what it said. Reasoning was streamed and then
	 * dropped on the floor, so reopening a conversation lost it entirely — the reader saw
	 * conclusions with the working erased.
	 */
	async recordAssistantReasoning(
		conversationId: ConversationId,
		text: string,
		model?: string,
		provenance?: {
			readonly runId: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.append(conversationId, 'assistant', { type: 'reasoning', text }, model, provenance);
	}

	/**
	 * Journal a tool outcome as a `tool_activity` message row, settling `output`
	 * and `failure` from the arm of the activity that can carry them.
	 */
	async recordToolActivity(
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
			...(activity.status === 'approval_required' && activity.review
				? { review: { ...activity.review } }
				: {}),
			// Read off the arm that can have it. `decision` is gone: no writer ever
			// set it, so every row ever journalled carried its `null`.
			// A succeeded call with no output journals `null` rather than raising:
			// a tool that returned nothing settles as `providerToolOutput`'s
			// `none` kind and reaches here output-absent, which is a normal
			// outcome. The value itself needs no reading here — `ToolActivity`
			// carries the wire type, read once where the tool result was produced.
			output: toolActivityOutput(activity),
			failure:
				activity.status === 'failed' || activity.status === 'reported_failure'
					? activity.failure
					: null,
			status: activity.status
		};
		await this.append(conversationId, 'tool', content, undefined, provenance);
	}

	private async append(
		conversationId: ConversationId,
		role: Message['role'],
		content: AgentPayloadObject,
		model?: string,
		provenance?: {
			readonly runId?: AgentRunId;
			readonly eventCursor?: string;
		}
	): Promise<void> {
		await this.repository.appendMessage({
			id: crypto.randomUUID() as MessageId,
			conversationId,
			role,
			content,
			...(provenance?.runId ? { runId: provenance.runId } : {}),
			...(provenance?.eventCursor ? { eventCursor: provenance.eventCursor } : {}),
			...(model ? { model } : {}),
			createdAt: this.now()
		});
	}
}
