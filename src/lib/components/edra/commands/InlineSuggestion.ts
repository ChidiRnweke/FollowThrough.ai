import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { caretContextOf, caretWindowOf, shouldTrigger } from './inline-suggestion-trigger';

/**
 * Proactive ghost text at the caret, in the shape editors have taught people to
 * expect: grey inline text after a typing pause, Tab to accept, Esc to dismiss.
 *
 * The extension owns only presentation and timing. Fetching is injected, so the
 * editor never learns about transports and the policy stays testable with a
 * stub.
 */

export interface InlineSuggestionRequestInput {
	readonly prefix: string;
	readonly suffix: string;
	readonly heading?: string;
}

export interface InlineSuggestionOptions {
	fetchSuggestion?: (
		input: InlineSuggestionRequestInput,
		signal: AbortSignal
	) => Promise<{ readonly text: string }>;
	/** How long the caret must rest before we ask for a suggestion. */
	idleDelayMs: number;
}

interface InlineSuggestionState {
	readonly text: string;
	readonly from: number;
	/** Set once per session so the accept hint is shown only the first time. */
	readonly showHint: boolean;
}

export const inlineSuggestionKey = new PluginKey<InlineSuggestionState | null>('inline-suggestion');

/** Transaction meta: `null` clears, an object offers. */
type InlineSuggestionMeta = InlineSuggestionState | null;

/**
 * Silence after an accept or dismiss. Longer than the idle delay on purpose:
 * accepting one suggestion must not immediately conjure the next.
 */
const SUPPRESSION_MS = 900;

const acceptedWordOf = (text: string): string => {
	const match = /^\s*\S+/.exec(text);
	return match ? match[0] : text;
};

export const InlineSuggestion = Extension.create<InlineSuggestionOptions>({
	name: 'inlineSuggestion',
	// Above the editor's own Tab handling so accepting never indents a list.
	priority: 120,

	addOptions() {
		return { idleDelayMs: 300 };
	},

	addProseMirrorPlugins() {
		const options = this.options;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let inFlight: AbortController | undefined;
		let suppressedUntil = 0;

		const cancel = () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			inFlight?.abort();
			inFlight = undefined;
		};

		const clear = (view: EditorView) => {
			cancel();
			if (inlineSuggestionKey.getState(view.state))
				view.dispatch(view.state.tr.setMeta(inlineSuggestionKey, null as InlineSuggestionMeta));
		};

		const request = (view: EditorView) => {
			const fetchSuggestion = options.fetchSuggestion;
			if (!fetchSuggestion) return;
			// Focus is checked here rather than at schedule time: a programmatic
			// caret move lands the selection change before DOM focus settles, and
			// gating the schedule on focus would drop that first suggestion.
			if (!view.hasFocus()) return;
			if (!shouldTrigger(caretContextOf(view.state, Date.now() < suppressedUntil))) return;
			const origin = view.state.selection.$from.pos;
			const controller = new AbortController();
			inFlight = controller;
			void fetchSuggestion(caretWindowOf(view.state), controller.signal)
				.then(({ text }) => {
					// The caret moved or another request started while we waited:
					// the answer describes a position that no longer exists.
					if (controller.signal.aborted || inFlight !== controller) return;
					inFlight = undefined;
					if (!text || view.state.selection.$from.pos !== origin) return;
					view.dispatch(
						view.state.tr.setMeta(inlineSuggestionKey, {
							text,
							from: origin,
							// Shown on every suggestion, not just the first: without a
							// persistent affordance a re-triggered suggestion reads as
							// plain grey text and is easy to miss.
							showHint: true
						} satisfies InlineSuggestionMeta)
					);
				})
				.catch(() => {
					if (inFlight === controller) inFlight = undefined;
				});
		};

		const schedule = (view: EditorView) => {
			cancel();
			timer = setTimeout(() => request(view), options.idleDelayMs);
		};

		const accept = (view: EditorView, whole: boolean): boolean => {
			const suggestion = inlineSuggestionKey.getState(view.state);
			if (!suggestion) return false;
			const text = whole ? suggestion.text : acceptedWordOf(suggestion.text);
			cancel();
			suppressedUntil = Date.now() + SUPPRESSION_MS;
			view.dispatch(
				view.state.tr
					.insertText(text, suggestion.from)
					.setMeta(inlineSuggestionKey, null as InlineSuggestionMeta)
			);
			return true;
		};

		return [
			new Plugin<InlineSuggestionState | null>({
				key: inlineSuggestionKey,

				state: {
					init: () => null,
					apply(transaction: Transaction, current: InlineSuggestionState | null) {
						const meta = transaction.getMeta(inlineSuggestionKey) as
							| InlineSuggestionMeta
							| undefined;
						if (meta !== undefined) return meta;
						// Any edit or caret move invalidates the offered text.
						if (transaction.docChanged || transaction.selectionSet) return null;
						return current;
					}
				},

				props: {
					decorations(state: EditorState) {
						const suggestion = inlineSuggestionKey.getState(state);
						if (!suggestion) return null;
						return DecorationSet.create(state.doc, [
							Decoration.widget(
								suggestion.from,
								() => {
									const span = document.createElement('span');
									span.className = 'inline-suggestion';
									span.setAttribute('contenteditable', 'false');
									span.textContent = suggestion.text;
									if (suggestion.showHint) {
										const hint = document.createElement('span');
										hint.className = 'inline-suggestion-hint';
										hint.textContent = 'Tab';
										span.append(hint);
									}
									return span;
								},
								{ side: 1, marks: [] }
							)
						]);
					},

					handleKeyDown(view: EditorView, event: KeyboardEvent) {
						const suggestion = inlineSuggestionKey.getState(view.state);
						if (!suggestion) return false;
						if (event.key === 'Tab' && !event.shiftKey) {
							event.preventDefault();
							return accept(view, true);
						}
						if (event.key === 'ArrowRight' && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							return accept(view, false);
						}
						if (event.key === 'Escape') {
							event.preventDefault();
							suppressedUntil = Date.now() + SUPPRESSION_MS;
							clear(view);
							return true;
						}
						// A bare modifier press is not the writer moving on: holding Shift
						// to capitalise the next letter must not dismiss the offer.
						if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return false;
						// Anything else means the writer moved on; drop the offer but let
						// the key through so typing is never swallowed.
						clear(view);
						return false;
					}
				},

				view() {
					return {
						update(updated: EditorView, previous: EditorState) {
							const changed =
								!updated.state.doc.eq(previous.doc) ||
								!updated.state.selection.eq(previous.selection);
							if (!changed) return;
							if (inlineSuggestionKey.getState(updated.state)) return;
							schedule(updated);
						},
						destroy: cancel
					};
				}
			})
		];
	}
});
