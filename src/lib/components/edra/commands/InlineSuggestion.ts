import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
	caretContextOf,
	caretWindowOf,
	joinedSuggestion,
	shouldTrigger
} from './inline-suggestion-trigger';

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
	readonly headingPath: readonly string[];
	readonly blockType: string;
	readonly currentSection: string;
}

export interface InlineSuggestionOptions {
	fetchSuggestion?: (
		input: InlineSuggestionRequestInput,
		signal: AbortSignal
	) => Promise<{ readonly text: string }>;
	/** How long the caret must rest before we ask for a suggestion. */
	idleDelayMs: number;
	enabled: boolean;
}

interface InlineSuggestionStorage {
	setEnabled: (enabled: boolean) => void;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		inlineSuggestion: {
			setInlineSuggestionsEnabled: (enabled: boolean) => ReturnType;
		};
	}
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

export const InlineSuggestion = Extension.create<InlineSuggestionOptions, InlineSuggestionStorage>({
	name: 'inlineSuggestion',
	// Above the editor's own Tab handling so accepting never indents a list.
	priority: 120,

	addOptions() {
		return { idleDelayMs: 400, enabled: true };
	},

	addStorage() {
		return { setEnabled: () => undefined };
	},

	addCommands() {
		return {
			setInlineSuggestionsEnabled: (enabled) => () => {
				this.storage.setEnabled(enabled);
				return true;
			}
		};
	},

	addProseMirrorPlugins() {
		const options = this.options;
		const editor = this.editor;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let inFlight: AbortController | undefined;
		let requiresEdit = false;
		let composing = false;
		let shouldSchedule = false;
		let announce = (message: string) => void message;
		let acceptedThisSession =
			typeof sessionStorage !== 'undefined' &&
			sessionStorage.getItem('inline-suggestion-accepted') === '1';

		const cancel = () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
			inFlight?.abort();
			inFlight = undefined;
		};

		const clear = (view: EditorView) => {
			cancel();
			announce('');
			if (inlineSuggestionKey.getState(view.state))
				view.dispatch(view.state.tr.setMeta(inlineSuggestionKey, null as InlineSuggestionMeta));
		};

		const request = (view: EditorView) => {
			const fetchSuggestion = options.fetchSuggestion;
			if (!fetchSuggestion) return;
			if (!options.enabled || composing) return;
			// Focus is checked here rather than at schedule time: a programmatic
			// caret move lands the selection change before DOM focus settles, and
			// gating the schedule on focus would drop that first suggestion.
			if (!view.hasFocus()) return;
			if (!shouldTrigger(caretContextOf(view.state, requiresEdit))) return;
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
							showHint: !acceptedThisSession
						} satisfies InlineSuggestionMeta)
					);
					announce('Writing suggestion available. Tab accepts; Escape dismisses.');
				})
				.catch(() => {
					if (inFlight === controller) inFlight = undefined;
				});
		};

		const schedule = (view: EditorView) => {
			cancel();
			timer = setTimeout(() => request(view), options.idleDelayMs);
		};

		const accept = (view: EditorView): boolean => {
			const suggestion = inlineSuggestionKey.getState(view.state);
			if (!suggestion) return false;
			const characterBefore = view.state.doc.textBetween(
				Math.max(0, suggestion.from - 1),
				suggestion.from
			);
			const text = joinedSuggestion(characterBefore, suggestion.text);
			cancel();
			requiresEdit = true;
			view.dispatch(
				view.state.tr
					.insertText(text, suggestion.from)
					.setMeta(inlineSuggestionKey, null as InlineSuggestionMeta)
			);
			acceptedThisSession = true;
			if (typeof sessionStorage !== 'undefined')
				sessionStorage.setItem('inline-suggestion-accepted', '1');
			view.focus();
			return true;
		};

		this.storage.setEnabled = (enabled) => {
			options.enabled = enabled;
			if (!enabled && this.editor) clear(this.editor.view);
		};

		return [
			new Plugin<InlineSuggestionState | null>({
				key: inlineSuggestionKey,

				state: {
					init: () => null,
					apply(transaction: Transaction, current: InlineSuggestionState | null) {
						const meta = transaction.getMeta(inlineSuggestionKey) as
							InlineSuggestionMeta | undefined;
						if (meta !== undefined) return meta;
						// Any edit or caret move invalidates the offered text.
						if (transaction.docChanged) {
							const uiEvent = transaction.getMeta('uiEvent');
							shouldSchedule =
								uiEvent !== 'paste' && uiEvent !== 'cut' && !transaction.getMeta('history$');
							requiresEdit = false;
							return null;
						}
						if (transaction.selectionSet) return null;
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
									span.setAttribute('aria-hidden', 'true');
									span.addEventListener('pointerdown', (event) => {
										// Keep ProseMirror from moving the caret or blurring the editor
										// before the subsequent click can accept this offer.
										event.preventDefault();
									});
									span.addEventListener('click', (event) => {
										event.preventDefault();
										event.stopPropagation();
										accept(editor.view);
									});
									span.textContent = suggestion.text;
									if (suggestion.showHint) {
										const hint = document.createElement('span');
										hint.className = 'inline-suggestion-hint';
										hint.textContent = 'Tab or click';
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
							return accept(view);
						}
						if (event.key === 'Escape') {
							event.preventDefault();
							requiresEdit = true;
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

				view(view) {
					const dom = view.dom;
					const status = document.createElement('span');
					status.className = 'sr-only';
					status.setAttribute('aria-live', 'polite');
					status.setAttribute('aria-atomic', 'true');
					dom.parentElement?.append(status);
					announce = (message) => {
						status.textContent = message;
					};
					const onBlur = () => {
						clear(view);
					};
					const onCompositionStart = () => {
						composing = true;
						clear(view);
					};
					const onCompositionEnd = () => {
						composing = false;
					};
					dom.addEventListener('blur', onBlur, true);
					dom.addEventListener('compositionstart', onCompositionStart);
					dom.addEventListener('compositionend', onCompositionEnd);
					return {
						update(updated: EditorView, previous: EditorState) {
							if (updated.state.doc.eq(previous.doc)) return;
							if (inlineSuggestionKey.getState(updated.state)) return;
							if (shouldSchedule) schedule(updated);
							shouldSchedule = false;
						},
						destroy() {
							dom.removeEventListener('blur', onBlur, true);
							dom.removeEventListener('compositionstart', onCompositionStart);
							dom.removeEventListener('compositionend', onCompositionEnd);
							cancel();
							status.remove();
						}
					};
				}
			})
		];
	}
});
