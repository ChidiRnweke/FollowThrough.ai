import type { EditorState } from '@tiptap/pm/state';

/**
 * Decides whether the editor should ask for proactive ghost text at the current
 * caret. Kept pure and free of ProseMirror mutation so the policy — which is
 * the difference between a helpful feature and a distracting one — is testable
 * without an editor instance.
 */

/** Structured text where a prose continuation would be wrong or unwelcome. */
const EXCLUDED_PARENTS = new Set([
	'codeBlock',
	'mermaid',
	'drawio',
	'mathBlock',
	'mathInline',
	'table'
]);

/** Below this the note has too little shape for a continuation to be useful. */
const MIN_DOCUMENT_LENGTH = 40;

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

export interface CaretContext {
	readonly emptySelection: boolean;
	readonly parentNames: readonly string[];
	readonly documentLength: number;
	readonly characterBefore: string;
	readonly characterAfter: string;
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
	if (caret.documentLength < MIN_DOCUMENT_LENGTH) return false;
	if (caret.parentNames.some((name) => EXCLUDED_PARENTS.has(name))) return false;
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
		documentLength: state.doc.textBetween(0, state.doc.content.size, '\n', ' ').trim().length,
		characterBefore: state.doc.textBetween(Math.max(0, $from.pos - 1), $from.pos),
		characterAfter: state.doc.textBetween(
			$from.pos,
			Math.min(state.doc.content.size, $from.pos + 1)
		),
		suppressed
	};
};

/** The plain-text window the completion sees around the caret. */
export interface CaretWindow {
	readonly prefix: string;
	readonly suffix: string;
	readonly heading?: string;
}

const PREFIX_LIMIT = 2000;
const SUFFIX_LIMIT = 500;

export const caretWindowOf = (state: EditorState): CaretWindow => {
	const position = state.selection.$from.pos;
	const prefix = state.doc.textBetween(0, position, '\n', ' ').slice(-PREFIX_LIMIT);
	const suffix = state.doc
		.textBetween(position, state.doc.content.size, '\n', ' ')
		.slice(0, SUFFIX_LIMIT);
	const heading = nearestHeading(state);
	return { prefix, suffix, ...(heading ? { heading } : {}) };
};

/** The closest heading above the caret, which names the section being written. */
const nearestHeading = (state: EditorState): string | undefined => {
	const position = state.selection.$from.pos;
	let heading: string | undefined;
	state.doc.nodesBetween(0, position, (node) => {
		if (node.type.name === 'heading') heading = node.textContent.trim() || heading;
		return true;
	});
	return heading;
};
