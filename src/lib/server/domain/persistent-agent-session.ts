import type { AgentInputItem, Session } from '@openai/agents';
import type { ActorContext, ConversationId } from '$lib/models';
import type { AgentSessionRepository } from '$lib/repositories';

export class PersistentAgentSession implements Session {
	constructor(
		private readonly repository: AgentSessionRepository,
		private readonly actor: ActorContext,
		private readonly conversationId: ConversationId
	) {}

	async getSessionId(): Promise<string> {
		return this.conversationId;
	}

	async getItems(limit?: number): Promise<AgentInputItem[]> {
		const rows = await this.repository.list(this.actor, this.conversationId, limit);
		return rows.map((row) => row.item as AgentInputItem);
	}

	async addItems(items: AgentInputItem[]): Promise<void> {
		await this.repository.append(
			this.actor,
			this.conversationId,
			items as Readonly<Record<string, unknown>>[]
		);
	}

	async popItem(): Promise<AgentInputItem | undefined> {
		const row = await this.repository.pop(this.actor, this.conversationId);
		return row?.item as AgentInputItem | undefined;
	}

	async clearSession(): Promise<void> {
		await this.repository.clear(this.actor, this.conversationId);
	}
}
