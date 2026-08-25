import { createHash } from 'node:crypto';
import { getEncoding } from 'js-tiktoken';
import type { ConversationId } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';

const encoding = getEncoding('cl100k_base');

/** Reuses the measured boundary already enforced for attached context notes. */
const REPLAY_FILE_THRESHOLD_TOKENS = 4000;
const DIAGRAM_TOOLS = new Set(['create_diagram', 'edit_diagram']);

const safeSegment = (value: string): string => {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
	return safe.length > 0 ? safe : 'content';
};

export class AgentReplayVirtualizer {
	constructor(private readonly files: AgentFileRepository) {}

	async virtualize(
		actor: ActorContext,
		conversationId: ConversationId,
		item: Readonly<Record<string, unknown>>
	): Promise<Readonly<Record<string, unknown>>> {
		const isTool = item.type === 'function_call' || item.type === 'function_call_result';
		const isMessage = item.type === 'message' || item.role === 'user' || item.role === 'assistant';
		if (!isTool && !isMessage) return item;
		if (typeof item.name === 'string' && DIAGRAM_TOOLS.has(item.name)) return item;
		const callId =
			typeof item.callId === 'string'
				? item.callId
				: typeof item.call_id === 'string'
					? item.call_id
					: createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16);
		if (item.type === 'function_call' && typeof item.arguments === 'string') {
			const parsed = JSON.parse(item.arguments) as unknown;
			const virtualized = await this.walk(
				actor,
				conversationId,
				parsed,
				safeSegment(callId),
				'arguments'
			);
			return { ...item, arguments: JSON.stringify(virtualized) };
		}
		return this.walk(
			actor,
			conversationId,
			item,
			safeSegment(callId),
			isMessage ? 'message' : 'item'
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
			if (encoding.encode(value).length <= REPLAY_FILE_THRESHOLD_TOKENS) return value;
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
