import type { EditorState } from '@tiptap/pm/state';

/**
 * Decides whether the editor should ask for proactive ghost text at the current
 * caret. Kept pure and free of ProseMirror mutation so the policy — which is
 * the difference between a helpful feature and a distracting one — is testable
 * without an editor instance.
 */

/** Structured text where a prose continuation would be wrong or unwelcome. */
const EXCLUDED_PARENTS = new Set([
	'heading',
	'codeBlock',
	'mermaid',
	'drawio',
	'mathBlock',
	'mathInline',
	'table'
]);

/** Below this the note has too little shape for a continuation to be useful. */
const MIN_DOCUMENT_LENGTH = 12;
const EXCLUDED_MARKS = new Set(['link', 'code', 'inlineCode']);

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export interface CaretContext {
	readonly emptySelection: boolean;
	readonly parentNames: readonly string[];
	readonly markNames: readonly string[];
	readonly documentLength: number;
	readonly characterBefore: string;
	readonly characterAfter: string;
	readonly meaningfulPrefixLength: number;
	readonly suppressed: boolean;
}

/**
 * Suggest only at a resting caret in ordinary prose. Notably we do suggest
 * mid-paragraph — the completion sees the text after the caret — but never
 * mid-word, where ghost text would render inside the word being typed.
 */
export const shouldTrigger = (caret: CaretContext): boolean => {
	if (caret.suppressed) return false;
	if (!caret.emptySelection) return false;
	if (
		caret.documentLength < MIN_DOCUMENT_LENGTH ||
		caret.meaningfulPrefixLength < MIN_DOCUMENT_LENGTH
	)
		return false;
	if (caret.parentNames.some((name) => EXCLUDED_PARENTS.has(name))) return false;
	if (caret.markNames.some((name) => EXCLUDED_MARKS.has(name))) return false;
	// A caret at the very start of a block has nothing to continue from.
	if (!caret.characterBefore) return false;
	// Mid-word: ghost text would render inside the word being typed.
	if (WORD_CHARACTER.test(caret.characterBefore) && WORD_CHARACTER.test(caret.characterAfter))
		return false;
	return true;
};

/** Reads the caret context out of a live editor state. */
export const caretContextOf = (state: EditorState, suppressed: boolean): CaretContext => {
	const { $from, empty } = state.selection;
	const parentNames: string[] = [];
	for (let depth = $from.depth; depth > 0; depth--) parentNames.push($from.node(depth).type.name);
	return {
		emptySelection: empty,
		parentNames,
		markNames: $from.marks().map((mark) => mark.type.name),
		documentLength: state.doc.textBetween(0, state.doc.content.size, '\n', ' ').trim().length,
		characterBefore: state.doc.textBetween(Math.max(0, $from.pos - 1), $from.pos),
		characterAfter: state.doc.textBetween(
			$from.pos,
			Math.min(state.doc.content.size, $from.pos + 1)
		),
		meaningfulPrefixLength: state.doc.textBetween(0, $from.pos, '\n', ' ').trim().length,
		suppressed
	};
};

/**
 * The text to insert when a suggestion is accepted, with the word seam repaired.
 *
 * `shouldTrigger` never fires mid-word, so a suggestion always begins at the end of a
 * complete word or after punctuation. That makes the seam unambiguous: a word character
 * on both sides of the join can only be two words run together, never a word being
 * completed. The server prompt asks the model to own its own leading space, and
 * `sanitizeCompletion` strips a stray one — this covers the opposite slip, which nothing
 * else did.
 */
export const joinedSuggestion = (characterBefore: string, suggestion: string): string => {
	if (!suggestion) return suggestion;
	if (!WORD_CHARACTER.test(characterBefore)) return suggestion;
	return WORD_CHARACTER.test(suggestion[0]) ? ` ${suggestion}` : suggestion;
};

/** The plain-text window the completion sees around the caret. */
export interface CaretWindow {
	readonly prefix: string;
	readonly suffix: string;
	readonly heading?: string;
	readonly headingPath: readonly string[];
	readonly blockType: string;
	readonly currentSection: string;
}

const PREFIX_LIMIT = 4000;
const SUFFIX_LIMIT = 1000;
const SECTION_LIMIT = 8000;

export const caretWindowOf = (state: EditorState): CaretWindow => {
	const position = state.selection.$from.pos;
	const prefix = state.doc.textBetween(0, position, '\n', ' ').slice(-PREFIX_LIMIT);
	const suffix = state.doc
		.textBetween(position, state.doc.content.size, '\n', ' ')
		.slice(0, SUFFIX_LIMIT);
	const headingPath = headingsAbove(state);
	const heading = headingPath.at(-1);
	const currentSection = sectionAroundCaret(state);
	return {
		prefix,
		suffix,
		headingPath,
		blockType: state.selection.$from.parent.type.name,
		currentSection,
		...(heading ? { heading } : {})
	};
};

const headingsAbove = (state: EditorState): string[] => {
	const position = state.selection.$from.pos;
	const path: string[] = [];
	state.doc.nodesBetween(0, position, (node) => {
		if (node.type.name === 'heading') {
			const level = Number(node.attrs.level ?? 1);
			path.splice(Math.max(0, level - 1));
			if (node.textContent.trim()) path[level - 1] = node.textContent.trim();
		}
		return true;
	});
	return path.filter(Boolean);
};

const sectionAroundCaret = (state: EditorState): string => {
	const caret = state.selection.$from.pos;
	let start = 0;
	let end = state.doc.content.size;
	state.doc.descendants((node, position) => {
		if (node.type.name !== 'heading') return true;
		if (position < caret) start = position + node.nodeSize;
		else if (end === state.doc.content.size) end = position;
		return true;
	});
	return state.doc.textBetween(start, end, '\n', ' ').trim().slice(-SECTION_LIMIT);
};
