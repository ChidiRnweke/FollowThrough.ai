import type { AgentInputItem, Session } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';

/**
 * An attached image is worth its tokens on the turn it arrives, when the model
 * is being asked about it. Persisting the data URL makes every later turn of
 * every later run replay it — one 326 KB PNG was re-sent twelve times in a
 * single run, uncached, and rode along in the span payload each time. The
 * placeholder keeps the transcript honest about what was there.
 */
const INLINE_IMAGE_PLACEHOLDER = '<image omitted from history; ask the user to re-attach it>';
const isInlineImage = (value: unknown): value is string =>
	typeof value === 'string' && value.startsWith('data:') && value.includes(';base64,');

const withoutInlineImages = <T>(value: T): T => {
	if (isInlineImage(value)) return INLINE_IMAGE_PLACEHOLDER as T;
	if (Array.isArray(value)) return value.map(withoutInlineImages) as T;
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>).map(([key, item]) => [
			key,
			withoutInlineImages(item)
		])
	) as T;
};

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
		return (await this.load()).map((item) =>
			withoutInlineImages({ ...(item as Record<string, unknown>) })
		);
	}

	private async load(): Promise<AgentInputItem[]> {
		if (!this.items) {
			const rows = await this.repository.list(this.actor, this.conversationId);
			this.items = rows.map((row) => row.item as AgentInputItem);
		}
		return this.items;
	}
}
