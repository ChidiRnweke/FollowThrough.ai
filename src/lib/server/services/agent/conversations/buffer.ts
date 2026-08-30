import type { AgentInputItem, Session } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import type {
	ConversationId,
	FunctionCallResultSessionItem,
	PersistedSessionItem,
	TextOutputPart,
	UserContentPart,
	UserMessageSessionItem
} from '$lib/models/agent';
import {
	parseSessionItem,
	readSessionJsonObject,
	sessionOutputText,
	toStoredSessionItem
} from '$lib/models/agent';
import { FAILURE_PREFIX } from '$lib/models/agent/tool-failure';
import type { AgentSessionRepository } from '$lib/server/repositories/agent';

/**
 * The session provider adapter: the only place the SDK's item union meets a
 * stored one.
 *
 * Both directions go through the model's own functions rather than an
 * assertion. `toStoredSessionItem` puts an arm back into the spelling the
 * provider uses and `parseSessionItem` reads that spelling, so mapping an item
 * to the SDK is the same operation as writing it to the column and the two
 * cannot drift.
 *
 * The remaining cast is the honest form of a fact TypeScript cannot express:
 * the SDK's union is declared in the provider package, our arms were read off
 * that package's own zod schemas, and no structural relation between two
 * independently declared unions exists for the compiler to check. The
 * `unrecognised` arm is what makes it genuinely unavoidable — it carries a
 * shape from a newer SDK precisely because this code cannot name it.
 */
export const toAgentInputItem = (item: PersistedSessionItem): AgentInputItem =>
	toStoredSessionItem(item) as AgentInputItem;

/** An SDK item on its way to storage, checked rather than asserted. */
const fromAgentInputItem = (item: AgentInputItem): PersistedSessionItem => parseSessionItem(item);

export interface ReplayVirtualizer {
	virtualize(
		actor: ActorContext,
		conversationId: ConversationId,
		item: PersistedSessionItem
	): Promise<PersistedSessionItem>;
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

/**
 * The `unknown` intermediate is the honest one: `JSON.parse` returns `any`, and
 * a cast onto it would be the assertion this module exists to stop making. A
 * value that is not a JSON object carries no `source` to elide, which is the
 * same answer the old `typeof parsed.source !== 'string'` test gave.
 */
const withElidedSource = (json: string): string => {
	const decoded: unknown = JSON.parse(json);
	const parsed = readSessionJsonObject(decoded);
	if (!parsed || typeof parsed.source !== 'string') return json;
	return JSON.stringify({ ...parsed, source: DIAGRAM_SOURCE_PLACEHOLDER });
};

const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';

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
const failedDiagramCalls = (items: readonly PersistedSessionItem[]): ReadonlySet<string> => {
	const failed = new Set<string>();
	for (const item of items) {
		if (item.type !== 'function_call_result' || !isDiagramWrite(item.name)) continue;
		const text = sessionOutputText(item);
		if (text !== undefined && isFailureEnvelope(text)) failed.add(item.callId);
	}
	return failed;
};

const elidedOutput = (
	output: FunctionCallResultSessionItem['output']
): FunctionCallResultSessionItem['output'] => {
	if (typeof output === 'string') return withElidedSource(output);
	if (!('type' in output)) return output;
	const part: TextOutputPart = { ...output, text: withElidedSource(output.text) };
	return part;
};

/** Both halves of a diagram write carry the whole document. */
const withoutDiagramSource = (
	item: PersistedSessionItem,
	failed: ReadonlySet<string>
): PersistedSessionItem => {
	switch (item.type) {
		case 'function_call':
			if (!isDiagramWrite(item.name) || failed.has(item.callId)) return item;
			return { ...item, arguments: withElidedSource(item.arguments) };
		case 'function_call_result':
			if (!isDiagramWrite(item.name) || failed.has(item.callId)) return item;
			return { ...item, output: elidedOutput(item.output) };
		default:
			// An `unrecognised` item lands here and is left exactly as stored. This
			// code does not know what the shape means, so it has no business
			// restructuring it.
			return item;
	}
};

export class ConversationBuffer implements Session {
	private items: PersistedSessionItem[] | undefined;
	/** `items` as the model is shown them, invalidated whenever `items` changes. */
	private shown: PersistedSessionItem[] | undefined;

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
		const shown = limit === undefined ? this.shown : this.shown.slice(-limit);
		return shown.map(toAgentInputItem);
	}

	async addItems(items: AgentInputItem[]): Promise<void> {
		(await this.load()).push(...items.map(fromAgentInputItem));
		this.shown = undefined;
	}

	async popItem(): Promise<AgentInputItem | undefined> {
		const item = (await this.load()).pop();
		this.shown = undefined;
		return item && toAgentInputItem(item);
	}

	async clearSession(): Promise<void> {
		this.items = [];
		this.shown = undefined;
	}

	async snapshot(): Promise<readonly PersistedSessionItem[]> {
		return Promise.all(
			(await this.load()).map((item) =>
				this.virtualizer.virtualize(this.actor, this.conversationId, withoutInlineImages(item))
			)
		);
	}

	private async load(): Promise<PersistedSessionItem[]> {
		if (!this.items) {
			const rows = await this.repository.list(this.actor, this.conversationId);
			// Repaired on the way in as well as on the way out: conversations stored
			// before the placeholder became a text part still hold an unsendable
			// image, and a history the model can never be shown again is a
			// conversation the user cannot continue.
			this.items = rows.map((row) => withoutInlineImages(row.item));
		}
		return this.items;
	}
}
