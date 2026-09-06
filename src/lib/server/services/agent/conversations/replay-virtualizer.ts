import { createHash } from 'node:crypto';
import { tokenEncoding } from '$lib/models/tokenization/token-encoding';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';

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
		item: PersistedSessionItem
	): Promise<PersistedSessionItem> {
		// `reasoning` and `unrecognised` are left alone: the first is the model's own
		// scratch text and the second is a shape this code did not understand.
		switch (item.type) {
			case 'function_call':
				if (DIAGRAM_TOOLS.has(item.name)) return item;
				return {
					...item,
					arguments: JSON.stringify(
						await this.walk(
							actor,
							conversationId,
							// The tool's own payload, which the session-item union does not
							// claim to know. `unknown` is the honest type for it here.
							JSON.parse(item.arguments) as unknown,
							safeSegment(item.callId),
							'arguments'
						)
					)
				};
			case 'function_call_result':
				if (DIAGRAM_TOOLS.has(item.name)) return item;
				return this.walk(actor, conversationId, item, safeSegment(item.callId), 'item');
			case 'user_message':
			case 'assistant_message':
				return this.walk(
					actor,
					conversationId,
					item,
					// A message carries no call id. Hashing it is not a fallback for a
					// missing fact — it is the only stable name a message has, and it is
					// what the stored file path is keyed by.
					safeSegment(createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16)),
					'message'
				);
			default:
				return item;
		}
	}

	private async walk<T>(
		actor: ActorContext,
		conversationId: ConversationId,
		value: T,
		callId: string,
		location: string
	): Promise<T> {
		if (typeof value === 'string') {
			if (tokenEncoding().encode(value).length <= REPLAY_FILE_THRESHOLD_TOKENS) return value;
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
