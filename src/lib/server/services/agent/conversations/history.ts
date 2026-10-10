import type { ActorContext } from '$lib/models/identity';
import type {
	ConversationId,
	PersistedSessionItem,
	FunctionCallResultSessionItem,
	UserContentPart,
	UserMessageSessionItem,
	SessionJsonObject
} from '$lib/models/agent';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';
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

const sessionOutputText = (item: FunctionCallResultSessionItem): string | undefined => {
	const { output } = item;
	if (typeof output === 'string') return output;
	return 'type' in output ? output.text : undefined;
};

const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';
const DIAGRAM_SOURCE_PLACEHOLDER =
	'[source omitted from history; call read_canvas_diagram to read the current diagram]';
export interface ConversationHistory {
	load(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<readonly PersistedSessionItem[]>;
	persistable(items: readonly PersistedSessionItem[]): readonly PersistedSessionItem[];
	diagramResults(
		items: readonly PersistedSessionItem[]
	): readonly { readonly callId: string; readonly text: string }[];
	replaySources(
		items: readonly PersistedSessionItem[],
		failed: ReadonlySet<string>
	): readonly { readonly index: number; readonly json: string }[];
	present(
		items: readonly PersistedSessionItem[],
		documents: ReadonlyMap<number, SessionJsonObject | undefined>
	): readonly PersistedSessionItem[];
}
/** Prepares stored history for provider replay while preserving complete persisted diagrams. */
export class ConversationHistoryService implements ConversationHistory {
	constructor(private readonly repository: AgentSessionRepository) {}
	async load(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<readonly PersistedSessionItem[]> {
		const rows = await this.repository.list(actor, conversationId);
		return rows.map((row) => withoutInlineImages(row.item));
	}
	persistable(items: readonly PersistedSessionItem[]): readonly PersistedSessionItem[] {
		return items.map(withoutInlineImages);
	}
	diagramResults(
		items: readonly PersistedSessionItem[]
	): readonly { readonly callId: string; readonly text: string }[] {
		return items.flatMap((item) => {
			if (item.type !== 'function_call_result' || !isDiagramWrite(item.name)) return [];
			const text = sessionOutputText(item);
			return text === undefined ? [] : [{ callId: item.callId, text }];
		});
	}
	replaySources(
		items: readonly PersistedSessionItem[],
		failed: ReadonlySet<string>
	): readonly { readonly index: number; readonly json: string }[] {
		return items.flatMap((item, index) => {
			if (item.type !== 'function_call' && item.type !== 'function_call_result') return [];
			if (!isDiagramWrite(item.name) || failed.has(item.callId)) return [];
			const json = item.type === 'function_call' ? item.arguments : sessionOutputText(item);
			return json === undefined ? [] : [{ index, json }];
		});
	}
	present(
		items: readonly PersistedSessionItem[],
		documents: ReadonlyMap<number, SessionJsonObject | undefined>
	): readonly PersistedSessionItem[] {
		return items.map((item, index) => {
			const parsed = documents.get(index);
			if (!parsed || typeof parsed.source !== 'string') return item;
			const json = JSON.stringify({ ...parsed, source: DIAGRAM_SOURCE_PLACEHOLDER });
			if (item.type === 'function_call') return { ...item, arguments: json };
			if (item.type !== 'function_call_result') return item;
			if (typeof item.output === 'string') return { ...item, output: json };
			return 'type' in item.output ? { ...item, output: { ...item.output, text: json } } : item;
		});
	}
}
