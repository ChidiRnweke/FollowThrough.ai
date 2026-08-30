import {
	agentPayloadItems,
	isAgentPayloadObject,
	type AgentPayloadObject,
	type AgentPayload
} from '$lib/models/agent/payload';
import { argumentLabel, isIdentifierArgument } from '../../chat/actions/tool-approval-fields';

/**
 * What a tool call gave back, in the reader's terms.
 *
 * The store has carried `output` since tool activity was first modelled, and no surface has
 * ever shown it: an expanded row repeated the arguments and stopped, so "Read note" could be
 * opened and still not say what was read. The shapes that come back are narrow — the
 * projections in `tool-views.ts` — so a summary can be honest about all of them without
 * printing JSON at anyone.
 *
 * `empty` means there is nothing worth a block; the row renders no Result section at all
 * rather than a line that says "no result", which is noise on every read the agent does.
 *
 * The bar is what a person would want to know, not what came back on the wire. An etag, a
 * revision number and an internal tool name are all faithful and all useless, and a note the
 * row already links to does not need its body echoed underneath.
 */
export interface ToolResultSummary {
	/** What came back, counted or named, on its own line. */
	readonly headline?: string;
	/** Readable fields or items, at most five. */
	readonly lines: readonly string[];
	/** Free text the tool returned, rendered as markdown rather than as a line. */
	readonly prose?: string;
	/** How many items the lines did not show. */
	readonly more?: number;
	readonly empty: boolean;
}

/** Longer than this is prose the model or the note wrote, not a field value. */
const PROSE_LENGTH = 120;

/**
 * Transport bookkeeping. `Etag: note:99691b75…:r14` is faithful and useless — it names a
 * revision the reader cannot act on, in a syntax that is not theirs.
 */
const noise = new Set(['etag', 'revision', 'version', 'cursor', 'checksum', 'callid', 'runid']);

const isNoise = (key: string): boolean => noise.has(key.toLowerCase());

const ITEM_CAP = 5;

const EMPTY: ToolResultSummary = { lines: [], empty: true };

const readable = (value: AgentPayload): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** One line for one element of a returned collection: its name, or failing that, itself. */
const itemLine = (item: AgentPayload): string | undefined => {
	if (readable(item)) return String(item).slice(0, PROSE_LENGTH);
	if (!isAgentPayloadObject(item)) return undefined;
	for (const key of ['title', 'name', 'content', 'text', 'query']) {
		const value = item[key];
		if (typeof value === 'string' && value.trim()) return value.slice(0, PROSE_LENGTH);
	}
	return undefined;
};

const fromArray = (items: readonly AgentPayload[]): ToolResultSummary => {
	if (items.length === 0) return { headline: 'Nothing found', lines: [], empty: false };
	const lines = items
		.slice(0, ITEM_CAP)
		.map(itemLine)
		.filter((line): line is string => !!line);
	const hidden = items.length - lines.length;
	return {
		headline: items.length === 1 ? '1 result' : `${items.length} results`,
		lines,
		...(hidden > 0 ? { more: hidden } : {}),
		empty: false
	};
};

/**
 * A recoverable failure the run reported as an ordinary result — the shape
 * `RecoverableUseToolFailure` builds server-side. It is the most important thing a row can
 * say, so it is read before the record's other fields.
 */
const fromFailure = (record: AgentPayloadObject): ToolResultSummary | undefined => {
	const failure = record.failure;
	if (typeof failure !== 'string') return undefined;
	const recovery = typeof record.recovery === 'string' ? [record.recovery] : [];
	return { headline: failure, lines: recovery, empty: false };
};

const fromRecord = (record: AgentPayloadObject): ToolResultSummary => {
	const failed = fromFailure(record);
	if (failed) return failed;

	const entries = Object.entries(record).filter(
		([key, value]) => readable(value) && !isIdentifierArgument(key, value) && !isNoise(key)
	);
	const prose = entries.find(
		([, value]) => typeof value === 'string' && value.length > PROSE_LENGTH
	);
	const lines = entries
		.filter(([key]) => key !== prose?.[0])
		.slice(0, ITEM_CAP)
		.map(([key, value]) => `${argumentLabel(key)}: ${String(value)}`);

	if (!prose && lines.length === 0) {
		// A collection nested one level down (`{ notes: [...] }`) is the result, not a field.
		const nested = Object.values(record)
			.map(agentPayloadItems)
			.find((value) => value !== undefined);
		return nested ? fromArray(nested) : EMPTY;
	}
	return {
		lines,
		...(prose ? { prose: String(prose[1]) } : {}),
		empty: false
	};
};

/**
 * A tool search returns internal tool names. Listing them puts `create_note`, `archive_note`
 * in front of someone who asked for a shorter note — the count is the whole of what they
 * could want from it, and only in the log.
 */
const toolSearchSummary = (output: AgentPayload | undefined): ToolResultSummary => {
	const found = output === undefined ? 0 : (agentPayloadItems(output)?.length ?? 0);
	return {
		headline: found === 1 ? 'Found 1 tool it can use' : `Found ${found} tools it can use`,
		lines: [],
		empty: false
	};
};

/**
 * Why a call failed, in the reader's language.
 *
 * The messages the run produces are written for the model — "oldText appears 3 times. Quote
 * more surrounding text to make it unique, or set replaceAll." — and shown verbatim they ask
 * the reader to debug a tool call they never made. These map the shapes that actually occur
 * onto what happened to *their* note. Anything unrecognised falls through unchanged: the
 * server's own words beat a paraphrase that might be wrong.
 */
export function explainToolFailure(failure: string): string {
	const text = failure.toLowerCase();
	if (text.includes('oldtext was not found') || text.includes('oldtext appears'))
		return 'The text it meant to change was not where it expected. The note may have moved on since it read it.';
	if (text.includes('oldtext is empty') || text.includes('nothing to change'))
		return 'The edit it wrote had nothing in it to apply.';
	if (text.includes('revision') || text.includes('conflict') || text.includes('stale'))
		return 'The note changed while the agent was writing, so its version is out of date.';
	if (text.includes('not found') || text.includes('no longer exists'))
		return 'What it was working on could not be found. It may have been moved or deleted.';
	if (text.includes('forbidden') || text.includes('not allowed') || text.includes('permission'))
		return 'It does not have access to that.';
	if (text.includes('timed out') || text.includes('timeout'))
		return 'It took too long to respond and the step was abandoned.';
	return failure;
}

export function summariseToolResult(
	output: AgentPayload | undefined,
	toolName?: string
): ToolResultSummary {
	if (toolName === 'search_tools') return toolSearchSummary(output);
	if (output === undefined || output === null) return EMPTY;
	if (typeof output === 'string') {
		const text = output.trim();
		if (!text) return EMPTY;
		return text.length > PROSE_LENGTH
			? { lines: [], prose: text, empty: false }
			: { lines: [text], empty: false };
	}
	if (typeof output === 'number' || typeof output === 'boolean')
		return { lines: [String(output)], empty: false };
	const items = agentPayloadItems(output);
	if (items) return fromArray(items);
	if (isAgentPayloadObject(output)) return fromRecord(output);
	return EMPTY;
}
