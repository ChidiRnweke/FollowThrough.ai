import type {
	ActorContext,
	AgentSessionItem,
	AgentSessionItemId,
	ConversationId
} from '$lib/models';
import type { AgentSessionRepository } from '$lib/server/repositories';
import type { SnapshotParticipant } from './in-memory-transaction';

const now = () => new Date().toISOString() as AgentSessionItem['createdAt'];

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
		items: readonly Readonly<Record<string, unknown>>[]
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
		items: readonly Readonly<Record<string, unknown>>[]
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
		return structuredClone(this.items);
	}

	restore(snapshot: unknown): void {
		this.items = snapshot as AgentSessionItem[];
	}
}
