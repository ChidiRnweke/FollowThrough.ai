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

const ITEM_CAP = 5;

const EMPTY: ToolResultSummary = { lines: [], empty: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const readable = (value: unknown): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** One line for one element of a returned collection: its name, or failing that, itself. */
const itemLine = (item: unknown): string | undefined => {
	if (readable(item)) return String(item).slice(0, PROSE_LENGTH);
	if (!isRecord(item)) return undefined;
	for (const key of ['title', 'name', 'content', 'text', 'query']) {
		const value = item[key];
		if (typeof value === 'string' && value.trim()) return value.slice(0, PROSE_LENGTH);
	}
	return undefined;
};

const fromArray = (items: readonly unknown[]): ToolResultSummary => {
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
const fromFailure = (record: Record<string, unknown>): ToolResultSummary | undefined => {
	const failure = record.failure;
	if (typeof failure !== 'string') return undefined;
	const recovery = typeof record.recovery === 'string' ? [record.recovery] : [];
	return { headline: failure, lines: recovery, empty: false };
};

const fromRecord = (record: Record<string, unknown>): ToolResultSummary => {
	const failed = fromFailure(record);
	if (failed) return failed;

	const entries = Object.entries(record).filter(
		([key, value]) => readable(value) && !isIdentifierArgument(key, value)
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
		const nested = Object.values(record).find(Array.isArray);
		return nested ? fromArray(nested) : EMPTY;
	}
	return {
		lines,
		...(prose ? { prose: String(prose[1]) } : {}),
		empty: false
	};
};

export function summariseToolResult(output: unknown): ToolResultSummary {
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
	if (Array.isArray(output)) return fromArray(output);
	if (isRecord(output)) return fromRecord(output);
	return EMPTY;
}
