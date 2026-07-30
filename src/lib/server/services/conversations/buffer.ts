import type { AgentInputItem, Session } from '@openai/agents';
import type { ActorContext, ConversationId } from '$lib/models';
import type { AgentSessionRepository } from '$lib/server/repositories';

export class ConversationBuffer implements Session {
	private items: AgentInputItem[] | undefined;

	constructor(
		private readonly repository: AgentSessionRepository,
		private readonly actor: ActorContext,
		private readonly conversationId: ConversationId
	) {}

	async getSessionId(): Promise<string> {
		return this.conversationId;
	}

	async getItems(limit?: number): Promise<AgentInputItem[]> {
		const items = await this.load();
		return limit === undefined ? [...items] : items.slice(-limit);
	}

	async addItems(items: AgentInputItem[]): Promise<void> {
		(await this.load()).push(...items);
	}

	async popItem(): Promise<AgentInputItem | undefined> {
		return (await this.load()).pop();
	}

	async clearSession(): Promise<void> {
		this.items = [];
	}

	async snapshot(): Promise<readonly Readonly<Record<string, unknown>>[]> {
		return (await this.load()).map((item) => ({ ...(item as Record<string, unknown>) }));
	}

	private async load(): Promise<AgentInputItem[]> {
		if (!this.items) {
			const rows = await this.repository.list(this.actor, this.conversationId);
			this.items = rows.map((row) => row.item as AgentInputItem);
		}
		return this.items;
	}
}
