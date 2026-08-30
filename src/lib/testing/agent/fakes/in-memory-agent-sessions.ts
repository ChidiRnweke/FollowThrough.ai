import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentSessionItem,
	AgentSessionItemId,
	ConversationId,
	PersistedSessionItem
} from '$lib/models/agent';
import { parseSessionItem, sessionJsonObjectSchema, toStoredSessionItem } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { SnapshotParticipant } from '$lib/testing/workspace/fakes/in-memory-transaction';

const now = () => new Date().toISOString() as AgentSessionItem['createdAt'];

const restoredItemsSchema = z.array(
	z.object({
		id: z.string().transform((value) => value as AgentSessionItemId),
		conversationId: z.string().transform((value) => value as ConversationId),
		position: z.number().int(),
		item: sessionJsonObjectSchema,
		createdAt: z.string().transform((value) => value as AgentSessionItem['createdAt'])
	})
);

export class InMemoryAgentSessionRepository implements AgentSessionRepository, SnapshotParticipant {
	items: AgentSessionItem[] = [];

	async list(
		_actor: ActorContext,
		conversationId: ConversationId,
		limit?: number
	): Promise<readonly AgentSessionItem[]> {
		const owned = this.items
			.filter((item) => item.conversationId === conversationId)
			.sort((left, right) => left.position - right.position);
		return limit === undefined ? owned : owned.slice(-limit);
	}

	async append(
		_actor: ActorContext,
		conversationId: ConversationId,
		items: readonly PersistedSessionItem[]
	): Promise<void> {
		const start =
			this.items
				.filter((item) => item.conversationId === conversationId)
				.reduce((highest, item) => Math.max(highest, item.position), -1) + 1;
		items.forEach((item, index) =>
			this.items.push({
				id: crypto.randomUUID() as AgentSessionItemId,
				conversationId,
				position: start + index,
				item,
				createdAt: now()
			})
		);
	}

	async pop(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<AgentSessionItem | undefined> {
		const owned = await this.list(actor, conversationId);
		const latest = owned[owned.length - 1];
		if (!latest) return undefined;
		this.items = this.items.filter((item) => item.id !== latest.id);
		return latest;
	}

	async clear(_actor: ActorContext, conversationId: ConversationId): Promise<void> {
		this.items = this.items.filter((item) => item.conversationId !== conversationId);
	}

	async replace(
		conversationId: ConversationId,
		items: readonly PersistedSessionItem[]
	): Promise<void> {
		this.items = this.items.filter((item) => item.conversationId !== conversationId);
		items.forEach((item, position) =>
			this.items.push({
				id: crypto.randomUUID() as AgentSessionItemId,
				conversationId,
				position,
				item,
				createdAt: now()
			})
		);
	}

	snapshot(): unknown {
		return structuredClone(
			this.items.map((row) => ({ ...row, item: toStoredSessionItem(row.item) }))
		);
	}

	/**
	 * Parsed rather than asserted, so the fake cannot hold a row the repository
	 * would refuse to return: a fixture encoding an impossible state teaches the
	 * bug to everyone who copies it.
	 */
	restore(snapshot: unknown): void {
		this.items = restoredItemsSchema.parse(snapshot).map((row) => ({
			...row,
			item: parseSessionItem(row.item)
		}));
	}
}
