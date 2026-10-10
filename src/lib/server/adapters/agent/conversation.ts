import type { ReplayJsonReader } from '$lib/server/controllers/agent/replay';
import { sessionJsonSchema, type SessionJson } from '$lib/models/agent';
import type { AgentInputItem, Session } from '@openai/agents';
import {
	persistedSessionItemSchema,
	sessionJsonObjectSchema,
	type PersistedSessionItem,
	type SessionJsonObject
} from '$lib/models/agent';
import type {
	ConversationSessionController,
	ConversationJsonReader
} from '$lib/server/controllers/agent/conversation';
export interface BufferedConversationSession extends Session {
	snapshot(): Promise<readonly PersistedSessionItem[]>;
}
/** The SDK's item union is parsed here before any controller sees it. */
export class ConversationSessionAdapter implements BufferedConversationSession {
	constructor(
		private readonly session: ConversationSessionController,
		private readonly encode: (item: PersistedSessionItem) => AgentInputItem
	) {}
	async getSessionId(): Promise<string> {
		return this.session.id;
	}
	async getItems(limit?: number): Promise<AgentInputItem[]> {
		return (await this.session.getItems(limit)).map(this.encode);
	}
	addItems(items: AgentInputItem[]): Promise<void> {
		return this.session.addItems(items.map((item) => persistedSessionItemSchema.parse(item)));
	}
	async popItem(): Promise<AgentInputItem | undefined> {
		const item = await this.session.popItem();
		return item && this.encode(item);
	}
	async clearSession(): Promise<void> {
		this.session.clear();
	}
	snapshot(): Promise<readonly PersistedSessionItem[]> {
		return this.session.snapshot();
	}
}
export class ConversationJsonBoundary implements ConversationJsonReader, ReplayJsonReader {
	value(text: string): SessionJson {
		return sessionJsonSchema.parse(JSON.parse(text));
	}
	constructor(private readonly readFailure: (text: string) => string | undefined) {}
	failure(text: string): string | undefined {
		return this.readFailure(text);
	}
	object(text: string): SessionJsonObject | undefined {
		return sessionJsonObjectSchema.safeParse(JSON.parse(text)).data;
	}
}
