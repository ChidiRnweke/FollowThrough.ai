import type {
	ConversationId,
	PersistedSessionItem,
	UserContentPart,
	UserMessageSessionItem
} from '$lib/models/agent';
import {
	sessionJsonSchema,
	type ReplayContent,
	type ReplayPreparation,
	type SessionJson
} from '$lib/models/agent';
import type { TokenCounter } from '$lib/models/tokenization';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import { createHash } from 'node:crypto';
const INLINE_IMAGE_PLACEHOLDER = '[image omitted from history; ask the user to re-attach it]';

const isInlineImage = (value: string): boolean =>
	value.startsWith('data:') && value.includes(';base64,');

/**
 * True for an image part whose payload is not something the provider can fetch:
 * an inline data URL we are about to drop, or a placeholder a previous version
 * of this code already left behind.
 */
const isDroppableImagePart = (part: UserContentPart): boolean =>
	part.type === 'input_image' && (isInlineImage(part.image) || !/^https?:\/\//i.test(part.image));

/**
 * Only a user message can carry one, and only its content parts are rewritten.
 *
 * This used to be a recursive rebuild of every object inside every row, guarded
 * by a `JSON.stringify(...).includes('input_image')` probe to avoid paying for
 * it on the conversations — almost all of them — that contain no image at all.
 * The parsed item says where an image part can be, so both the recursion and
 * the probe that existed to avoid it are gone.
 */
const withoutInlineImages = (item: PersistedSessionItem): PersistedSessionItem => {
	if (item.type !== 'user_message' || typeof item.content === 'string') return item;
	if (!item.content.some(isDroppableImagePart)) return item;
	const content: UserContentPart[] = item.content.map((part) =>
		// Replaced whole rather than descended into: the part is what is invalid, and
		// only swapping it for a valid part of another kind keeps the item sendable.
		isDroppableImagePart(part) ? { type: 'input_text', text: INLINE_IMAGE_PLACEHOLDER } : part
	);
	const repaired: UserMessageSessionItem = { ...item, content };
	return repaired;
};

/** Reuses the measured boundary already enforced for attached context notes. */
/** A tool call's arguments as JSON, or a failure when the model's text is not JSON. */
const readArguments = (
	text: string
): { readonly kind: 'json'; readonly value: SessionJson } | { readonly kind: 'failure' } => {
	try {
		const parsed = sessionJsonSchema.safeParse(JSON.parse(text));
		return parsed.success ? { kind: 'json', value: parsed.data } : { kind: 'failure' };
	} catch {
		return { kind: 'failure' };
	}
};

const REPLAY_FILE_THRESHOLD_TOKENS = 4000;
const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';

const safeSegment = (value: string): string => {
	const safe = value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
	return safe.length > 0 ? safe : 'content';
};

export interface ConversationHistory {
	rewind(
		items: readonly PersistedSessionItem[],
		ordinal: number
	): readonly PersistedSessionItem[] | undefined;
	load(conversationId: ConversationId): Promise<readonly PersistedSessionItem[]>;
	/**
	 * The items to store after a turn: inline images are dropped, and large replay content
	 * moves into agent files the model can read back with grep or sed.
	 */
	snapshot(
		conversationId: ConversationId,
		items: readonly PersistedSessionItem[]
	): Promise<readonly PersistedSessionItem[]>;
}
/** Stored agent conversation history, kept small enough to replay to the provider. */
export class ConversationHistoryService implements ConversationHistory {
	constructor(
		private readonly repository: AgentSessionRepository,
		private readonly files: AgentFileRepository,
		private readonly tokens: TokenCounter
	) {}
	rewind(
		items: readonly PersistedSessionItem[],
		ordinal: number
	): readonly PersistedSessionItem[] | undefined {
		return rewindToUserItem(items, ordinal);
	}
	async load(conversationId: ConversationId): Promise<readonly PersistedSessionItem[]> {
		const rows = await this.repository.list(conversationId);
		return rows.map((row) => withoutInlineImages(row.item));
	}
	snapshot(
		conversationId: ConversationId,
		items: readonly PersistedSessionItem[]
	): Promise<readonly PersistedSessionItem[]> {
		return Promise.all(
			items.map(withoutInlineImages).map((item) => this.virtualize(conversationId, item))
		);
	}

	private virtualize(
		conversationId: ConversationId,
		item: PersistedSessionItem
	): Promise<PersistedSessionItem> | PersistedSessionItem {
		const prepared = this.prepare(item);
		if (prepared.kind === 'unchanged') return prepared.item;
		if (prepared.kind !== 'arguments') return this.apply(conversationId, prepared);
		const read = readArguments(prepared.item.arguments);
		// Arguments the model sent as malformed JSON are kept verbatim: the SDK answered that
		// call with a correction and nothing ran, so there is nothing to move out of the replay.
		if (read.kind === 'failure') return prepared.item;
		return this.apply(conversationId, { ...prepared, value: read.value });
	}

	private prepare(item: PersistedSessionItem): ReplayPreparation {
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
	private async apply(
		conversationId: ConversationId,
		content: ReplayContent
	): Promise<PersistedSessionItem> {
		if (content.kind === 'arguments')
			return {
				...content.item,
				arguments: JSON.stringify(
					await this.walk(
						conversationId,
						content.value,
						safeSegment(content.item.callId),
						'arguments'
					)
				)
			};
		const item = content.item;
		if (item.type === 'function_call_result')
			return this.walk(conversationId, item, safeSegment(item.callId), 'item');
		// A message has no call id; its content hash is the stable storage identity.
		return this.walk(
			conversationId,
			item,
			safeSegment(createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16)),
			'message'
		);
	}

	private async walk<T>(
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
			const stored = await this.files.store({
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
					this.walk(conversationId, entry, callId, `${location}.${index}`)
				)
			)) as T;
		}
		if (value === null || typeof value !== 'object') return value;
		const entries = await Promise.all(
			Object.entries(value).map(async ([key, entry]) => [
				key,
				await this.walk(conversationId, entry, callId, `${location}.${key}`)
			])
		);
		return Object.fromEntries(entries) as T;
	}
}

const isUserItem = (item: PersistedSessionItem): boolean => item.type === 'user_message';

/**
 * The prefix of `items` that precedes the `ordinal`-th user item, or `undefined`
 * when there is no such item and nothing needs rewinding.
 */
function rewindToUserItem(
	items: readonly PersistedSessionItem[],
	ordinal: number
): readonly PersistedSessionItem[] | undefined {
	if (ordinal < 1) return undefined;
	const userIndices = items.reduce<number[]>((indices, item, index) => {
		if (isUserItem(item)) indices.push(index);
		return indices;
	}, []);
	const cut = userIndices[ordinal - 1];
	return cut === undefined ? undefined : items.slice(0, cut);
}
