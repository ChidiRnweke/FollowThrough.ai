/**
 * Reasoning arrives as free text — the provider gives no title and no block boundaries.
 * What it does give, reliably, is a leading bold line per thought ("**Weighing the two
 * schemas**"), which is how reasoning summaries are written. Splitting on those turns an
 * undifferentiated wall into sections a reader can skim, and gives the collapsed row a
 * label that says what the model was actually thinking about.
 */
export interface ReasoningSection {
	/** The heading the model wrote, when it wrote one. */
	readonly title?: string;
	readonly body: string;
}

/** A whole line that is nothing but a bold run, or a markdown heading. */
const HEADING = /^[ \t]*(?:\*\*(?<bold>[^*\n]+?)\*\*[ \t]*|#{1,6}[ \t]+(?<hash>[^\n]+?))[ \t]*$/;

/** `**Title** and then the thought continues` — a heading with its paragraph glued on. */
const INLINE_HEADING = /^[ \t]*\*\*(?<title>[^*\n]+?)\*\*[ \t]*(?<rest>\S[^\n]*)$/;

const FALLBACK_TITLE = 'Reasoning';
const TITLE_LENGTH = 60;

const headingOf = (line: string): { title: string; rest: string } | undefined => {
	const heading = HEADING.exec(line);
	if (heading?.groups)
		return { title: (heading.groups.bold ?? heading.groups.hash).trim(), rest: '' };
	const inline = INLINE_HEADING.exec(line);
	if (inline?.groups) return { title: inline.groups.title.trim(), rest: inline.groups.rest };
	return undefined;
};

const section = (title: string | undefined, lines: string[]): ReasoningSection | undefined => {
	const body = lines.join('\n').trim();
	if (!title && !body) return undefined;
	return { ...(title ? { title } : {}), body };
};

/**
 * Splits reasoning into titled sections. Text before the first heading keeps its place as
 * an untitled section, so nothing is dropped and nothing is reordered.
 */
export function parseReasoning(text: string): ReasoningSection[] {
	const sections: ReasoningSection[] = [];
	let title: string | undefined;
	let lines: string[] = [];

	for (const line of text.split('\n')) {
		const heading = headingOf(line);
		if (!heading) {
			lines.push(line);
			continue;
		}
		const previous = section(title, lines);
		if (previous) sections.push(previous);
		title = heading.title;
		lines = heading.rest ? [heading.rest] : [];
	}

	const last = section(title, lines);
	if (last) sections.push(last);
	return sections;
}

const firstSentence = (text: string): string | undefined => {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	if (!trimmed) return undefined;
	const stop = trimmed.search(/[.!?](\s|$)/);
	const sentence = stop === -1 ? trimmed : trimmed.slice(0, stop);
	return sentence.length > TITLE_LENGTH
		? `${sentence.slice(0, TITLE_LENGTH).trimEnd()}…`
		: sentence;
};

/**
 * The label for the collapsed row. The *last* title wins so the row tracks the live thought
 * while the model streams, rather than freezing on whatever it opened with.
 */
export function reasoningTitle(sections: readonly ReasoningSection[]): string {
	const titled = sections.filter((entry) => entry.title).at(-1);
	if (titled?.title) return titled.title;
	const body = sections.map((entry) => entry.body).find((text) => text.trim().length > 0);
	return (body ? firstSentence(body) : undefined) ?? FALLBACK_TITLE;
}
