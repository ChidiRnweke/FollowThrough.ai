import type { AgentInputItem, Session } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import { FAILURE_PREFIX } from '$lib/models/agent/tool-failure';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';

export interface ReplayVirtualizer {
	virtualize(
		actor: ActorContext,
		conversationId: ConversationId,
		item: Readonly<Record<string, unknown>>
	): Promise<Readonly<Record<string, unknown>>>;
}

/**
 * An attached image is worth its tokens on the turn it arrives, when the model
 * is being asked about it. Persisting the data URL makes every later turn of
 * every later run replay it — one 326 KB PNG was re-sent twelve times in a
 * single run, uncached, and rode along in the span payload each time.
 *
 * What replaces it has to be a *text part*, not a sentence left in the image's
 * own field. Writing the note into `input_image.image` produced an item the
 * provider rejects outright — "Expected a valid URL, but got a value with an
 * invalid format" — which failed the whole request on every later turn. One
 * image poisoned its conversation permanently, and with the web-search server
 * tool attached the reason arrived as an opaque "Server tool request failed".
 */
const INLINE_IMAGE_PLACEHOLDER = '[image omitted from history; ask the user to re-attach it]';

const isInlineImage = (value: unknown): value is string =>
	typeof value === 'string' && value.startsWith('data:') && value.includes(';base64,');

const textPart = () => ({ type: 'input_text', text: INLINE_IMAGE_PLACEHOLDER });

/**
 * True for an image part whose payload is not something the provider can fetch:
 * an inline data URL we are about to drop, or a placeholder a previous version
 * of this code already left behind.
 */
const isDroppableImagePart = (value: Record<string, unknown>): boolean => {
	if (value.type !== 'input_image') return false;
	const image = value.image;
	return typeof image !== 'string' || isInlineImage(image) || !/^https?:\/\//i.test(image);
};

const withoutInlineImages = <T>(value: T): T => {
	if (Array.isArray(value)) return value.map(withoutInlineImages) as T;
	if (value === null || typeof value !== 'object') return value;
	const record = value as Record<string, unknown>;
	// Replaced whole rather than descended into: the part is what is invalid, and
	// only swapping it for a valid part of another kind keeps the item sendable.
	if (isDroppableImagePart(record)) return textPart() as T;
	return Object.fromEntries(
		Object.entries(record).map(([key, item]) => [key, withoutInlineImages(item)])
	) as T;
};

/**
 * Diagram source is elided from replayed history, not from storage.
 *
 * An mxfile is 5–8 KB and `create_diagram` carries it twice — once in the call's
 * arguments, once in its result — so a conversation with five revisions replayed
 * eighty kilobytes of markup on every later turn, for a document the agent almost
 * never needed to re-read. The row keeps the source; `read_canvas_diagram` hands
 * it back on the turn that actually needs it.
 */
const DIAGRAM_SOURCE_PLACEHOLDER =
	'[source omitted from history; call read_canvas_diagram to read the current diagram]';

const withElidedSource = (json: string): string => {
	const parsed = JSON.parse(json) as Record<string, unknown>;
	if (typeof parsed.source !== 'string') return json;
	return JSON.stringify({ ...parsed, source: DIAGRAM_SOURCE_PLACEHOLDER });
};

const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';

/** The text half of a tool result, whichever of the three shapes it arrived in. */
const outputText = (
	output: AgentInputItem & { type: 'function_call_result' }
): string | undefined =>
	typeof output.output === 'string'
		? output.output
		: !Array.isArray(output.output) && output.output.type === 'text'
			? output.output.text
			: undefined;

/**
 * A failure envelope, recognised without parsing.
 *
 * `buildTool` builds these with `JSON.stringify({ failure, recovery })`, so the
 * key is always first. Matching the prefix rather than parsing keeps this total:
 * there is no malformed-JSON branch to invent an answer for.
 */
const isFailureEnvelope = (text: string): boolean => text.trimStart().startsWith(FAILURE_PREFIX);

/**
 * Diagram calls the model has to be able to re-read, because they failed.
 *
 * Eliding a *failed* call's source left the model unable to see what it had
 * sent: `read_canvas_diagram` only answers with the last version that worked, so
 * a rejected document was gone. It re-sent the same broken XML twice before
 * getting it right. The size argument for eliding does not apply here — this is
 * the one call it actually needs to read.
 */
const failedDiagramCalls = (items: readonly AgentInputItem[]): ReadonlySet<string> => {
	const failed = new Set<string>();
	for (const item of items) {
		if (item.type !== 'function_call_result' || !isDiagramWrite(item.name)) continue;
		const text = outputText(item);
		if (text !== undefined && isFailureEnvelope(text)) failed.add(item.callId);
	}
	return failed;
};

/** Both halves of a diagram write carry the whole document. */
const withoutDiagramSource = (
	item: AgentInputItem,
	failed: ReadonlySet<string>
): AgentInputItem => {
	switch (item.type) {
		case 'function_call':
			if (!isDiagramWrite(item.name) || failed.has(item.callId)) return item;
			return { ...item, arguments: withElidedSource(item.arguments) };
		case 'function_call_result':
			if (!isDiagramWrite(item.name) || failed.has(item.callId)) return item;
			if (typeof item.output === 'string') {
				return { ...item, output: withElidedSource(item.output) };
			}
			if (!Array.isArray(item.output) && item.output.type === 'text') {
				return { ...item, output: { ...item.output, text: withElidedSource(item.output.text) } };
			}
			return item;
		default:
			return item;
	}
};

export class ConversationBuffer implements Session {
	private items: AgentInputItem[] | undefined;
	/** `items` as the model is shown them, invalidated whenever `items` changes. */
	private shown: AgentInputItem[] | undefined;

	constructor(
		private readonly repository: AgentSessionRepository,
		private readonly actor: ActorContext,
		private readonly conversationId: ConversationId,
		private readonly virtualizer: ReplayVirtualizer
	) {}

	async getSessionId(): Promise<string> {
		return this.conversationId;
	}

	async getItems(limit?: number): Promise<AgentInputItem[]> {
		const items = await this.load();
		// Elided here rather than in `load`, so `snapshot` still persists the whole
		// document: this is what the model is shown, not what is kept. Memoised
		// beside `items` because it re-parses and re-serialises every diagram in the
		// conversation, and it runs once per model turn.
		if (!this.shown) {
			const failed = failedDiagramCalls(items);
			this.shown = items.map((item) => withoutDiagramSource(item, failed));
		}
		return limit === undefined ? [...this.shown] : this.shown.slice(-limit);
	}

	async addItems(items: AgentInputItem[]): Promise<void> {
		(await this.load()).push(...items);
		this.shown = undefined;
	}

	async popItem(): Promise<AgentInputItem | undefined> {
		const item = (await this.load()).pop();
		this.shown = undefined;
		return item;
	}

	async clearSession(): Promise<void> {
		this.items = [];
		this.shown = undefined;
	}

	async snapshot(): Promise<readonly Readonly<Record<string, unknown>>[]> {
		return Promise.all(
			(await this.load()).map((item) =>
				this.virtualizer.virtualize(
					this.actor,
					this.conversationId,
					withoutInlineImages({ ...(item as Record<string, unknown>) })
				)
			)
		);
	}

	private async load(): Promise<AgentInputItem[]> {
		if (!this.items) {
			const rows = await this.repository.list(this.actor, this.conversationId);
			// Repaired on the way in as well as on the way out: conversations stored
			// before the placeholder became a text part still hold an unsendable
			// image, and a history the model can never be shown again is a
			// conversation the user cannot continue.
			//
			// The string test first because the repair is a full recursive rebuild of
			// every object in the item, and this runs over every row of every
			// conversation on load. Almost none of them contain an image at all.
			this.items = rows.map((row) =>
				JSON.stringify(row.item).includes('input_image')
					? (withoutInlineImages(row.item) as AgentInputItem)
					: (row.item as AgentInputItem)
			);
		}
		return this.items;
	}
}
