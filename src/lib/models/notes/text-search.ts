/**
 * Exact and regex search across notes, plus document-level replace.
 *
 * Notes keep a denormalized `plainText` next to the ProseMirror `document`; search runs
 * over plain text so callers get real match offsets, and replace maps those offsets back
 * onto the document's text nodes. Pure and isomorphic — the server controller uses it for
 * both the search query and the replace command, and the UI reuses the snippet shaping.
 *
 * Cross-boundary replace follows Word's behaviour: a match that spans inline formatting
 * (half bold, a link boundary) is replaced by collapsing the whole match into the first
 * text node it touches, so the replacement keeps that node's marks; the matched slice is
 * removed from every later node the match overlaps. A match that swallows a block
 * boundary removes the matched text from each block and drops any top-level block left
 * completely empty by the replacement.
 */

type NoteId = string & { readonly __brand: 'NoteId' };
type ProjectId = string & { readonly __brand: 'ProjectId' };

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

export interface NoteSearchOptions {
	readonly regex: boolean;
	readonly caseSensitive: boolean;
}

/** Half-open `[start, end)` offsets into the searched text, plus the matched text. */
export interface NoteTextMatch {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

/** A display window around a content match, so results render without shipping whole notes. */
export interface NoteSearchSnippet {
	readonly before: string;
	readonly hit: string;
	readonly after: string;
}

/** A content match paired with the snippet a result row renders. */
export interface NoteSearchContentMatch extends NoteTextMatch {
	readonly snippet: NoteSearchSnippet;
}

/** One note's worth of hits: content matches are offsets into `plainText`, title matches into `title`. */
export interface NoteSearchHit {
	readonly noteId: NoteId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly titleMatches: readonly NoteTextMatch[];
	readonly matches: readonly NoteSearchContentMatch[];
}

/** Matches per note are capped so a pathological query (`a` on a long note) stays a bounded payload. */
export const MAX_NOTE_SEARCH_MATCHES_PER_NOTE = 100;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The pattern behind a search. Literal queries are escaped, so every search is exact
 * unless `regex` is on. Returns `undefined` for an empty query or an invalid regex —
 * callers turn that into a validation error rather than searching with a stale pattern.
 */
export const buildNoteSearchPattern = (
	query: string,
	options: NoteSearchOptions
): RegExp | undefined => {
	if (query === '') return undefined;
	const source = options.regex ? query : escapeRegExp(query);
	try {
		return new RegExp(source, options.caseSensitive ? 'g' : 'gi');
	} catch {
		return undefined;
	}
};

interface RichMatch extends NoteTextMatch {
	readonly exec: RegExpExecArray;
}

/**
 * All non-overlapping matches. Zero-length matches (`a*`, `^`) are skipped — they cannot
 * be highlighted or replaced meaningfully, and skipping them keeps the loop total.
 */
const findMatches = (text: string, pattern: RegExp, limit: number): RichMatch[] => {
	const matches: RichMatch[] = [];
	pattern.lastIndex = 0;
	let exec = pattern.exec(text);
	while (exec !== null && matches.length < limit) {
		if (exec[0] === '') {
			pattern.lastIndex += 1;
		} else {
			matches.push({ start: exec.index, end: exec.index + exec[0].length, text: exec[0], exec });
		}
		exec = pattern.exec(text);
	}
	return matches;
};

export const searchNoteText = (
	text: string,
	query: string,
	options: NoteSearchOptions,
	limit: number = MAX_NOTE_SEARCH_MATCHES_PER_NOTE
): NoteTextMatch[] => {
	const pattern = buildNoteSearchPattern(query, options);
	if (pattern === undefined) return [];
	return findMatches(text, pattern, limit).map(({ start, end, text: matched }) => ({
		start,
		end,
		text: matched
	}));
};

/** A display window around a match: the hit plus `contextChars` of breathing room either side. */
export const noteSearchSnippet = (
	text: string,
	match: NoteTextMatch,
	contextChars = 60
): NoteSearchSnippet => ({
	before: text.slice(Math.max(0, match.start - contextChars), match.start),
	hit: text.slice(match.start, match.end),
	after: text.slice(match.end, match.end + contextChars)
});

/**
 * Expands `$` references in a replacement string the way `String.replace` does:
 * `$$` is a literal dollar, `$&` the whole match, `$1`–`$99` numbered captures and
 * `$<name>` named captures. Unknown or absent references expand to the empty string.
 */
export const expandNoteReplacement = (replacement: string, exec: RegExpExecArray): string =>
	replacement.replace(/\$(\$|&|\d{1,2}|<[^>]+>)/g, (_token, ref: string) => {
		if (ref === '$') return '$';
		if (ref === '&') return exec[0];
		if (ref.startsWith('<')) {
			const name = ref.slice(1, -1);
			return exec.groups?.[name] ?? '';
		}
		const group = exec[Number(ref)];
		return group ?? '';
	});

/** The block separator the note editor uses when it derives `plainText` from a document. */
const BLOCK_SEPARATOR = '\n\n';

/** A text node's slice of the layout string, tied to the (mutable) node it came from. */
interface TextSegment {
	readonly node: Record<string, unknown>;
	readonly start: number;
	readonly end: number;
}

/** A top-level block's span of the layout string, so fully-consumed blocks can be dropped. */
interface BlockSpan {
	readonly node: Record<string, unknown>;
	readonly textStart: number;
	readonly textEnd: number;
}

interface DocumentLayout {
	readonly text: string;
	readonly segments: readonly TextSegment[];
	readonly blocks: readonly BlockSpan[];
}

const isTextNode = (node: Record<string, unknown>): boolean => node.type === 'text';

/**
 * Walks a document into the plain-text layout the editor produces: text nodes contribute
 * their text, hard breaks a newline, and `BLOCK_SEPARATOR` lands before every block after
 * the first. Only text nodes are addressable for replacement, so separators and hard
 * breaks inside a match are absorbed by the surrounding edits rather than edited directly.
 */
const layoutDocument = (document: ProseMirrorDocument): DocumentLayout => {
	const chunks: string[] = [];
	const segments: TextSegment[] = [];
	const blocks: BlockSpan[] = [];
	let length = 0;
	let firstBlock = true;

	const push = (value: string): void => {
		chunks.push(value);
		length += value.length;
	};

	const walk = (node: Record<string, unknown>, depth: number): void => {
		if (isTextNode(node)) {
			const text = typeof node.text === 'string' ? node.text : '';
			segments.push({ node, start: length, end: length + text.length });
			push(text);
			return;
		}
		if (node.type === 'hardBreak') {
			push('\n');
			return;
		}
		if (!firstBlock) push(BLOCK_SEPARATOR);
		firstBlock = false;
		const textStart = length;
		const children = Array.isArray(node.content) ? (node.content as Record<string, unknown>[]) : [];
		for (const child of children) walk(child, depth + 1);
		if (depth === 0) blocks.push({ node, textStart, textEnd: length });
	};

	const topLevel = Array.isArray(document.content)
		? (document.content as Record<string, unknown>[])
		: [];
	for (const block of topLevel) walk(block, 0);

	return { text: chunks.join(''), segments, blocks };
};

/** The plain text of a document, derived the same way replace lays it out. */
export const noteDocumentText = (document: ProseMirrorDocument): string =>
	layoutDocument(document).text;

export interface NoteDocumentReplaceResult {
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	/** Matches actually replaced; zero-length matches are never counted. */
	readonly replaced: number;
}

const EMPTY_PARAGRAPH: Record<string, unknown> = { type: 'paragraph' };

/** Drops text nodes the replacement emptied; every other node keeps its shape. */
const pruneEmptyTextNodes = (node: Record<string, unknown>): void => {
	if (!Array.isArray(node.content)) return;
	const children = node.content as Record<string, unknown>[];
	node.content = children.filter((child) => !isTextNode(child) || child.text !== '');
	for (const child of node.content as Record<string, unknown>[]) pruneEmptyTextNodes(child);
};

const hasContent = (node: Record<string, unknown>): boolean =>
	Array.isArray(node.content) && (node.content as unknown[]).length > 0;

/**
 * Replaces every match of `query` in a document, returning a new document and its fresh
 * plain text. Returns `undefined` when the pattern is invalid or matches nothing, so the
 * caller can tell "no work" apart from a successful zero-length replacement.
 *
 * Each match is applied independently, latest first so earlier offsets stay valid. The
 * first text node a match overlaps absorbs the (group-expanded) replacement and keeps its
 * marks; later overlapping nodes lose just the matched slice. Top-level blocks whose
 * entire text was consumed by one match are removed, which is how a replace across a
 * paragraph boundary reads seamlessly instead of leaving an empty paragraph behind.
 */
export const replaceInNoteDocument = (
	document: ProseMirrorDocument,
	query: string,
	replacement: string,
	options: NoteSearchOptions
): NoteDocumentReplaceResult | undefined => {
	const pattern = buildNoteSearchPattern(query, options);
	if (pattern === undefined) return undefined;

	const clone = structuredClone(document) as {
		type: 'doc';
		content?: Record<string, unknown>[];
	};
	const layout = layoutDocument(clone);
	const matches = findMatches(layout.text, pattern, Number.POSITIVE_INFINITY);
	if (matches.length === 0) return undefined;

	for (const match of [...matches].sort((a, b) => b.start - a.start)) {
		const expanded = expandNoteReplacement(replacement, match.exec);
		let first = true;
		for (const segment of layout.segments) {
			if (segment.end <= match.start || segment.start >= match.end) continue;
			const nodeText = typeof segment.node.text === 'string' ? segment.node.text : '';
			const cutStart = Math.max(match.start, segment.start) - segment.start;
			const cutEnd = Math.min(match.end, segment.end) - segment.start;
			segment.node.text = first
				? nodeText.slice(0, cutStart) + expanded + nodeText.slice(cutEnd)
				: nodeText.slice(0, cutStart) + nodeText.slice(cutEnd);
			first = false;
		}
	}

	if (Array.isArray(clone.content)) {
		for (const block of clone.content) pruneEmptyTextNodes(block);
		const consumed = new Set(
			layout.blocks
				.filter((block) =>
					matches.some((match) => match.start <= block.textStart && match.end >= block.textEnd)
				)
				.map((block) => block.node)
		);
		clone.content = clone.content.filter((block) => !consumed.has(block) || hasContent(block));
		if (clone.content.length === 0) clone.content = [{ ...EMPTY_PARAGRAPH }];
	}

	return {
		document: clone,
		plainText: noteDocumentText(clone),
		replaced: matches.length
	};
};

/** The columns a text search needs — a note's document body never travels for search. */
export interface NoteSearchTarget {
	readonly id: NoteId;
	readonly projectId: ProjectId;
	readonly title: string;
	readonly plainText: string;
}

/** Assembles the hits for a set of search targets, dropping notes with no match at all. */
export const searchNoteTargets = (
	targets: readonly NoteSearchTarget[],
	query: string,
	options: NoteSearchOptions
): NoteSearchHit[] => {
	const hits: NoteSearchHit[] = [];
	for (const target of targets) {
		const titleMatches = searchNoteText(target.title, query, options);
		const matches = searchNoteText(target.plainText, query, options).map((match) => ({
			...match,
			snippet: noteSearchSnippet(target.plainText, match)
		}));
		if (titleMatches.length === 0 && matches.length === 0) continue;
		hits.push({
			noteId: target.id,
			projectId: target.projectId,
			title: target.title,
			titleMatches,
			matches
		});
	}
	return hits;
};

export interface SearchNoteTextInput {
	readonly query: string;
	readonly regex: boolean;
	readonly caseSensitive: boolean;
	/** Scope the search to one project; omit it to search every active note. */
	readonly projectId?: ProjectId;
}

export interface SearchNoteTextOutput {
	readonly hits: readonly NoteSearchHit[];
}

export interface ReplaceNoteTextInput extends SearchNoteTextInput {
	readonly replacement: string;
	/** Replace only in these notes; omit to replace in every note the search hits. */
	readonly noteIds?: readonly NoteId[];
}

export interface ReplaceNoteTextOutput {
	readonly replacedNotes: number;
	readonly replacedMatches: number;
}
