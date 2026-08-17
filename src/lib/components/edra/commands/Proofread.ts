import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

/**
 * Spelling and grammar underlines, drawn from an injected checker.
 *
 * The extension owns presentation, timing and position mapping only. What counts
 * as a problem is decided by whatever `check` is handed in, exactly as
 * `InlineSuggestion` takes its `fetchSuggestion` — the editor never learns that a
 * checker exists as a package, a worker or a network call, and the policy stays
 * testable against a stub.
 */

/** One offered fix, already reduced to the text the flagged span becomes. */
export interface ProofreadSuggestionOffer {
	readonly label: string;
	readonly replacement: string;
}

/** One problem, positioned in the text of a single block. */
export interface ProofreadIssueReport {
	readonly start: number;
	readonly end: number;
	readonly message: string;
	readonly kind: string;
	readonly text: string;
	readonly suggestions: readonly ProofreadSuggestionOffer[];
}

export interface ProofreadOptions {
	/** Lint one block's text. Omitting it disables proofreading entirely. */
	check?: (text: string) => Promise<readonly ProofreadIssueReport[]>;
	/** How long the writer must pause before the document is re-checked. */
	idleDelayMs: number;
	enabled: boolean;
}

/** The issue the reader has clicked, with the live positions of its span. */
export interface ProofreadSelection {
	readonly from: number;
	readonly to: number;
	readonly issue: ProofreadIssueReport;
}

interface ProofreadState {
	readonly decorations: DecorationSet;
	readonly selected?: ProofreadSelection;
}

interface ProofreadStorage {
	setEnabled: (enabled: boolean) => void;
	refresh: () => void;
}

interface ProofreadMeta {
	readonly decorations?: DecorationSet;
	/** `null` dismisses; an object selects. Absent leaves the selection alone. */
	readonly selected?: ProofreadSelection | null;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		proofread: {
			setProofreadEnabled: (enabled: boolean) => ReturnType;
			/** Replace a flagged span, then dismiss the menu that offered the fix. */
			applyProofreadSuggestion: (from: number, to: number, replacement: string) => ReturnType;
			dismissProofreadSelection: () => ReturnType;
			/**
			 * Re-check the document from scratch, discarding cached results. Needed
			 * when the answer changed without the text changing — teaching the
			 * dictionary a word is the case that matters.
			 */
			refreshProofread: () => ReturnType;
		};
	}
}

export const proofreadKey = new PluginKey<ProofreadState>('proofread');

/** The clicked issue, for a menu that needs to render and anchor to it. */
export const proofreadSelection = (state: EditorState): ProofreadSelection | undefined =>
	proofreadKey.getState(state)?.selected;

/**
 * Blocks whose text is not prose. A code block is the obvious one, but a mermaid
 * source and a maths body are just as certain to be flagged into uselessness, and
 * underlining them teaches the reader to ignore the underline.
 */
const skippedBlocks = new Set(['codeBlock', 'blockMath', 'mermaid', 'drawio', 'iframe']);

/**
 * A block's prose, with everything that is not prose blanked out to spaces.
 *
 * The spaces matter: they keep every following character at the offset the
 * checker will report, so a paragraph containing an inline `code` span or a
 * formula still maps its issues back to the right words. Dropping the content
 * instead would shift the rest of the paragraph left by its length.
 */
const proseTextOf = (node: PmNode): string => {
	let text = '';
	node.forEach((child) => {
		const isProse = child.isText && !child.marks.some((mark) => mark.type.name === 'code');
		text += isProse ? (child.text ?? '') : ' '.repeat(child.nodeSize);
	});
	return text;
};

interface Block {
	readonly pos: number;
	readonly text: string;
}

const proseBlocksOf = (doc: PmNode): Block[] => {
	const blocks: Block[] = [];
	doc.descendants((node, pos) => {
		if (skippedBlocks.has(node.type.name)) return false;
		if (!node.isTextblock) return true;
		const text = proseTextOf(node);
		if (text.trim() !== '') blocks.push({ pos, text });
		// A textblock's children are inline; there is nothing further to walk.
		return false;
	});
	return blocks;
};

/**
 * How many blocks of results are kept. Bounded because the key is the block's
 * text: every keystroke in a paragraph produces another entry, and an unbounded
 * map would hold every intermediate state of a long writing session.
 */
const CACHE_LIMIT = 300;

export const Proofread = Extension.create<ProofreadOptions, ProofreadStorage>({
	name: 'proofread',

	addOptions() {
		// Enabled, but inert until a `check` is injected — an editor that is handed
		// no checker does nothing regardless of this flag.
		return { idleDelayMs: 600, enabled: true };
	},

	addStorage() {
		return { setEnabled: () => undefined, refresh: () => undefined };
	},

	addCommands() {
		return {
			setProofreadEnabled: (enabled) => () => {
				this.storage.setEnabled(enabled);
				return true;
			},

			applyProofreadSuggestion:
				(from, to, replacement) =>
				({ tr, dispatch }) => {
					if (!dispatch) return true;
					// Replacing an empty range would insert rather than correct.
					if (from >= to) return false;
					if (replacement === '') tr.delete(from, to);
					else tr.replaceWith(from, to, this.editor.schema.text(replacement));
					tr.setMeta(proofreadKey, { selected: null } satisfies ProofreadMeta);
					dispatch(tr);
					return true;
				},

			dismissProofreadSelection:
				() =>
				({ tr, dispatch }) => {
					if (!proofreadKey.getState(this.editor.state)?.selected) return false;
					dispatch?.(tr.setMeta(proofreadKey, { selected: null } satisfies ProofreadMeta));
					return true;
				},

			refreshProofread: () => () => {
				this.storage.refresh();
				return true;
			}
		};
	},

	addProseMirrorPlugins() {
		const options = this.options;
		const editor = this.editor;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let composing = false;
		/** Bumped per pass so a slow result never overwrites a newer one. */
		let generation = 0;
		let cache = new Map<string, readonly ProofreadIssueReport[]>();

		const cancel = () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			generation += 1;
		};

		const issuesFor = async (text: string): Promise<readonly ProofreadIssueReport[]> => {
			const cached = cache.get(text);
			if (cached) return cached;
			const issues = await options.check!(text);
			// Cheapest bound that keeps the entries a writer actually revisits: drop
			// the whole map rather than tracking per-entry recency for a cache whose
			// misses cost one lint.
			if (cache.size >= CACHE_LIMIT) cache = new Map();
			cache.set(text, issues);
			return issues;
		};

		const run = async (view: EditorView) => {
			if (!options.check || !options.enabled || composing) return;
			const pass = ++generation;
			const blocks = proseBlocksOf(view.state.doc);
			const results = await Promise.all(
				blocks.map(async (block) => ({ block, issues: await issuesFor(block.text) }))
			);
			// The document moved on while we waited; these offsets describe a text
			// that is no longer there.
			if (pass !== generation) return;
			const decorations = results.flatMap(({ block, issues }) =>
				issues.map((issue) =>
					Decoration.inline(
						// +1 steps past the block's own opening token into its content.
						block.pos + 1 + issue.start,
						block.pos + 1 + issue.end,
						{ class: `proofread-issue proofread-issue--${issue.kind.toLowerCase()}` },
						{ issue }
					)
				)
			);
			view.dispatch(
				view.state.tr.setMeta(proofreadKey, {
					decorations: DecorationSet.create(view.state.doc, decorations)
				} satisfies ProofreadMeta)
			);
		};

		const schedule = (view: EditorView) => {
			cancel();
			timer = setTimeout(() => void run(view), options.idleDelayMs);
		};

		const clear = (view: EditorView) => {
			cancel();
			cache = new Map();
			view.dispatch(
				view.state.tr.setMeta(proofreadKey, {
					decorations: DecorationSet.empty,
					selected: null
				} satisfies ProofreadMeta)
			);
		};

		/**
		 * Hand the underline to exactly one checker. The browser's own is on by
		 * default for any editable region, so leaving it alone would double every
		 * misspelling: a native red squiggle with an OS context menu, under our own
		 * with a menu that can actually fix it.
		 */
		const applyNativeSpellcheck = (view: EditorView) => {
			view.dom.setAttribute('spellcheck', String(!(options.enabled && options.check)));
		};

		this.storage.refresh = () => {
			if (!editor || !options.enabled) return;
			// The cache is keyed by block text, and the text has not changed — only
			// the answer has. Without dropping it, a word just added to the dictionary
			// stays underlined until its paragraph is edited.
			cache = new Map();
			schedule(editor.view);
		};

		this.storage.setEnabled = (enabled) => {
			if (options.enabled === enabled) return;
			options.enabled = enabled;
			if (!editor) return;
			applyNativeSpellcheck(editor.view);
			if (enabled) schedule(editor.view);
			else clear(editor.view);
		};

		return [
			new Plugin<ProofreadState>({
				key: proofreadKey,

				state: {
					init: () => ({ decorations: DecorationSet.empty }),
					apply(transaction: Transaction, current: ProofreadState): ProofreadState {
						const meta = transaction.getMeta(proofreadKey) as ProofreadMeta | undefined;
						const decorations =
							meta?.decorations ??
							// Mapped through the change so an underline tracks its word while
							// the debounced re-check is still pending. Without this every
							// keystroke drags the whole document's underlines out of place.
							(transaction.docChanged
								? current.decorations.map(transaction.mapping, transaction.doc)
								: current.decorations);

						if (meta?.selected !== undefined) {
							const selected = meta.selected ?? undefined;
							return selected ? { decorations, selected } : { decorations };
						}
						// A new set of results renumbers everything, and an edit can delete
						// the very span the menu is describing.
						if (meta?.decorations || transaction.docChanged) return { decorations };
						return { ...current, decorations };
					}
				},

				props: {
					decorations: (state) => proofreadKey.getState(state)?.decorations,

					handleClick(view: EditorView, pos: number) {
						const decorations = proofreadKey.getState(view.state)?.decorations;
						const found = decorations?.find(pos, pos) ?? [];
						// `find` is inclusive of touching spans, so a click on the boundary
						// between two words offers both; the one actually under the caret is
						// the one whose range contains the position.
						const hit = found.find((decoration) => pos > decoration.from && pos < decoration.to);
						if (!hit) {
							// A click anywhere else in the document is the reader moving on.
							if (proofreadKey.getState(view.state)?.selected)
								view.dispatch(
									view.state.tr.setMeta(proofreadKey, { selected: null } satisfies ProofreadMeta)
								);
							return false;
						}
						view.dispatch(
							view.state.tr.setMeta(proofreadKey, {
								selected: {
									from: hit.from,
									to: hit.to,
									issue: (hit.spec as { issue: ProofreadIssueReport }).issue
								}
							} satisfies ProofreadMeta)
						);
						return false;
					},

					handleKeyDown(view: EditorView, event: KeyboardEvent) {
						if (event.key !== 'Escape') return false;
						if (!proofreadKey.getState(view.state)?.selected) return false;
						event.preventDefault();
						view.dispatch(
							view.state.tr.setMeta(proofreadKey, { selected: null } satisfies ProofreadMeta)
						);
						return true;
					}
				},

				view(view) {
					const dom = view.dom;
					const onCompositionStart = () => {
						composing = true;
						cancel();
					};
					const onCompositionEnd = () => {
						composing = false;
						schedule(view);
					};
					dom.addEventListener('compositionstart', onCompositionStart);
					dom.addEventListener('compositionend', onCompositionEnd);
					applyNativeSpellcheck(view);
					// The document arrives already written, so the first pass is not
					// waiting on anybody's keystroke.
					if (options.enabled && options.check) schedule(view);
					return {
						update(updated: EditorView, previous: EditorState) {
							if (updated.state.doc.eq(previous.doc)) return;
							schedule(updated);
						},
						destroy() {
							dom.removeEventListener('compositionstart', onCompositionStart);
							dom.removeEventListener('compositionend', onCompositionEnd);
							cancel();
						}
					};
				}
			})
		];
	}
});
