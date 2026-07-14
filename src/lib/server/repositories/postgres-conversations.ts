import { and, asc, desc, eq } from 'drizzle-orm';
import type { ActorContext, Conversation, Message } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { ConversationRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toConversation = (row: typeof schema.conversations.$inferSelect): Conversation => ({
	id: row.id as Conversation['id'],
	userId: row.userId as Conversation['userId'],
	...(row.contextNoteId
		? { contextNoteId: row.contextNoteId as Conversation['contextNoteId'] }
		: {}),
	...(row.title ? { title: row.title } : {}),
	...(row.modelOverride ? { modelOverride: row.modelOverride } : {}),
	...(row.executionModeOverride ? { executionModeOverride: row.executionModeOverride } : {}),
	createdAt: row.createdAt.toISOString() as Conversation['createdAt'],
	updatedAt: row.updatedAt.toISOString() as Conversation['updatedAt']
});

const toMessage = (row: typeof schema.messages.$inferSelect): Message => ({
	id: row.id as Message['id'],
	conversationId: row.conversationId as Message['conversationId'],
	role: row.role,
	content: row.content,
	...(row.model ? { model: row.model } : {}),
	createdAt: row.createdAt.toISOString() as Message['createdAt']
});

export class PostgresConversationRepository implements ConversationRepository {
	constructor(private readonly database: Database) {}

	async list(actor: ActorContext): Promise<readonly Conversation[]> {
		return (
			await this.database
				.select()
				.from(schema.conversations)
				.where(eq(schema.conversations.userId, actor.userId))
				.orderBy(desc(schema.conversations.updatedAt))
		).map(toConversation);
	}

	async findById(actor: ActorContext, id: Conversation['id']): Promise<Conversation | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.conversations)
			.where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, actor.userId)));
		return row ? toConversation(row) : undefined;
	}

	async insert(actor: ActorContext, conversation: Conversation): Promise<Conversation> {
		const [row] = await this.database
			.insert(schema.conversations)
			.values({
				id: conversation.id,
				userId: actor.userId,
				contextNoteId: conversation.contextNoteId,
				title: conversation.title,
				modelOverride: conversation.modelOverride,
				executionModeOverride: conversation.executionModeOverride,
				createdAt: new Date(conversation.createdAt),
				updatedAt: new Date(conversation.updatedAt)
			})
			.returning();
		return toConversation(row!);
	}

	async update(actor: ActorContext, conversation: Conversation): Promise<Conversation> {
		const [row] = await this.database
			.update(schema.conversations)
			.set({
				contextNoteId: conversation.contextNoteId,
				title: conversation.title,
				modelOverride: conversation.modelOverride,
				executionModeOverride: conversation.executionModeOverride,
				updatedAt: new Date(conversation.updatedAt)
			})
			.where(
				and(
					eq(schema.conversations.id, conversation.id),
					eq(schema.conversations.userId, actor.userId)
				)
			)
			.returning();
		if (!row) throw new NotFoundError('Conversation was not found');
		return toConversation(row);
	}

	async appendMessage(actor: ActorContext, message: Message): Promise<Message> {
		if (!(await this.findById(actor, message.conversationId)))
			throw new NotFoundError('Conversation was not found');
		const [row] = await this.database
			.insert(schema.messages)
			.values({
				id: message.id,
				conversationId: message.conversationId,
				role: message.role,
				content: message.content,
				model: message.model,
				createdAt: new Date(message.createdAt)
			})
			.returning();
		await this.database
			.update(schema.conversations)
			.set({ updatedAt: new Date(message.createdAt) })
			.where(
				and(
					eq(schema.conversations.id, message.conversationId),
					eq(schema.conversations.userId, actor.userId)
				)
			);
		return toMessage(row!);
	}

	async listMessages(actor: ActorContext, id: Conversation['id']): Promise<readonly Message[]> {
		if (!(await this.findById(actor, id))) throw new NotFoundError('Conversation was not found');
		return (
			await this.database
				.select()
				.from(schema.messages)
				.where(eq(schema.messages.conversationId, id))
				.orderBy(asc(schema.messages.createdAt))
		).map(toMessage);
	}
}
