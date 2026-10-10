import type { TokenCounter } from '$lib/models/tokenization';
import { createHash } from 'node:crypto';
import type { ConversationId, PersistedSessionItem, SessionJson } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';

/** Reuses the measured boundary already enforced for attached context notes. */
const REPLAY_FILE_THRESHOLD_TOKENS = 4000;
const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';

const safeSegment = (value: string): string => {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
	return safe.length > 0 ? safe : 'content';
};

type ReplayRecord = Extract<
	PersistedSessionItem,
	{ type: 'function_call_result' | 'user_message' | 'assistant_message' }
>;
type ReplayCall = Extract<PersistedSessionItem, { type: 'function_call' }>;
export type ReplayPreparation =
	| { readonly kind: 'unchanged'; readonly item: PersistedSessionItem }
	| { readonly kind: 'arguments'; readonly item: ReplayCall }
	| { readonly kind: 'record'; readonly item: ReplayRecord };
export type ReplayContent =
	| { readonly kind: 'arguments'; readonly item: ReplayCall; readonly value: SessionJson }
	| { readonly kind: 'record'; readonly item: ReplayRecord };
export interface ReplayVirtualization {
	prepare(item: PersistedSessionItem): ReplayPreparation;
	apply(
		actor: ActorContext,
		conversationId: ConversationId,
		content: ReplayContent
	): Promise<PersistedSessionItem>;
}
export class AgentReplayVirtualizer implements ReplayVirtualization {
	constructor(
		private readonly files: AgentFileRepository,
		private readonly tokens: TokenCounter
	) {}
	prepare(item: PersistedSessionItem): ReplayPreparation {
		switch (item.type) {
			case 'function_call':
				return isDiagramWrite(item.name)
					? { kind: 'unchanged', item }
					: { kind: 'arguments', item };
			case 'function_call_result':
				return isDiagramWrite(item.name) ? { kind: 'unchanged', item } : { kind: 'record', item };
			case 'user_message':
			case 'assistant_message':
				return { kind: 'record', item };
			default:
				return { kind: 'unchanged', item };
		}
	}
	async apply(
		actor: ActorContext,
		conversationId: ConversationId,
		content: ReplayContent
	): Promise<PersistedSessionItem> {
		if (content.kind === 'arguments')
			return {
				...content.item,
				arguments: JSON.stringify(
					await this.walk(
						actor,
						conversationId,
						content.value,
						safeSegment(content.item.callId),
						'arguments'
					)
				)
			};
		const item = content.item;
		if (item.type === 'function_call_result')
			return this.walk(actor, conversationId, item, safeSegment(item.callId), 'item');
		// A message has no call id; its content hash is the stable storage identity.
		return this.walk(
			actor,
			conversationId,
			item,
			safeSegment(createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16)),
			'message'
		);
	}

	private async walk<T>(
		actor: ActorContext,
		conversationId: ConversationId,
		value: T,
		callId: string,
		location: string
	): Promise<T> {
		if (typeof value === 'string') {
			if (this.tokens.count(value) <= REPLAY_FILE_THRESHOLD_TOKENS) return value;
			const checksum = createHash('sha256').update(value).digest('hex');
			const category = location.startsWith('message.') ? 'history' : 'tool-results';
			const path = `/conversations/${conversationId}/${category}/${callId}/${safeSegment(location)}-${checksum.slice(0, 12)}.txt`;
			const stored = await this.files.store(actor, {
				conversationId,
				path,
				mediaType: 'text/plain',
				content: value
			});
			return `[content stored at ${path}; ${stored.metadata.byteSize} bytes, ${stored.metadata.tokenCount} tokens, ${stored.metadata.lineCount} lines; use grep or sed]` as T;
		}
		if (Array.isArray(value)) {
			return (await Promise.all(
				value.map((entry, index) =>
					this.walk(actor, conversationId, entry, callId, `${location}.${index}`)
				)
			)) as T;
		}
		if (value === null || typeof value !== 'object') return value;
		const entries = await Promise.all(
			Object.entries(value).map(async ([key, entry]) => [
				key,
				await this.walk(actor, conversationId, entry, callId, `${location}.${key}`)
			])
		);
		return Object.fromEntries(entries) as T;
	}
}
