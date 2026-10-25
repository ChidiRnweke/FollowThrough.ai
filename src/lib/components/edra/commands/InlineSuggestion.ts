import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ReplaceStep } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { InlineSuggestionCache } from './inline-suggestion-cache';
import {
	caretContextOf,
	caretRestsForSuggestion,
	caretTextOf,
	caretWindowOf,
	joinedSuggestion,
	shouldTrigger,
	type CaretText,
	type CaretWindow
} from './inline-suggestion-trigger';

/**
 * Proactive ghost text at the caret, in the shape code editors have taught
 * people to expect: grey inline text once the caret rests, Tab to accept, Esc
 * to dismiss, and typing the predicted letters keeps the rest on screen.
 *
 * The extension owns only presentation and timing. Fetching is injected, so the
 * editor never learns about transports and the policy stays testable with a
 * stub.
 */

/**
 * What a suggestion asks the editor to do at the caret: append text, or swap
 * the anchored characters on either side of the caret for it. The server has
 * verified a replacement's anchors against the text it was sent; the editor
 * verifies them again against the document before it offers anything.
 */
export type InlineSuggestionEdit =
	| { readonly kind: 'insert'; readonly text: string }
	| {
			readonly kind: 'replace';
			readonly replaceBefore: string;
			readonly replaceAfter: string;
			readonly text: string;
	  };

/** Why the editor is asking: the caret came to rest, or the writer pressed the shortcut. */
export type InlineSuggestionTrigger = 'idle' | 'explicit';

export interface InlineSuggestionRequestInput extends CaretWindow {
	readonly trigger: InlineSuggestionTrigger;
}

/**
 * One answer to one request. `retry` carries the server's own wait for when the
 * writer's per-minute budget is spent. `failure` is announced and otherwise
 * dropped: an autocomplete that cannot answer stays quiet.
 */
export type InlineSuggestionResult =
	| { readonly kind: 'offer'; readonly edit: InlineSuggestionEdit }
	| { readonly kind: 'none' }
	| { readonly kind: 'retry'; readonly afterMs: number }
	| { readonly kind: 'failure'; readonly message: string };

export interface InlineSuggestionOptions {
	fetchSuggestion?: (
		input: InlineSuggestionRequestInput,
		signal: AbortSignal
	) => Promise<InlineSuggestionResult>;
	/** How long the caret must rest before we ask for a suggestion. */
	idleDelayMs: number;
	enabled: boolean;
}

interface InlineSuggestionStorage {
	setEnabled: (enabled: boolean) => void;
	trigger: () => void;
}

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		inlineSuggestion: {
			setInlineSuggestionsEnabled: (enabled: boolean) => ReturnType;
			/** Ask for a suggestion now, without waiting for the caret to rest. */
			triggerInlineSuggestion: () => ReturnType;
		};
	}
}

/** An offer placed in the document: where it sits and what accepting it does. */
export type InlineSuggestionOffer =
	| { readonly kind: 'insert'; readonly from: number; readonly text: string }
	| {
			/** `from..to` is struck through and replaced by `text`; the caret sits inside it. */
			readonly kind: 'replace';
			readonly from: number;
			readonly to: number;
			readonly text: string;
	  };

export interface InlineSuggestionState {
	readonly offer: InlineSuggestionOffer;
	/** Set once per session so the accept hint is shown only the first time. */
	readonly showHint: boolean;
	/**
	 * A `continued` offer is what remained after the writer typed its first
	 * letters; it stays put instead of fading in again on every keystroke.
	 */
	readonly arrival: 'new' | 'continued';
}

export const inlineSuggestionKey = new PluginKey<InlineSuggestionState | null>('inline-suggestion');

/** Transaction meta: `null` clears, an object offers. */
type InlineSuggestionMeta = InlineSuggestionState | null;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const AVAILABLE = 'Writing suggestion available. Tab accepts; Escape dismisses.';
const EDIT_AVAILABLE = 'Writing edit available. Tab applies; Escape dismisses.';
const UNAVAILABLE = 'Writing suggestion unavailable.';

/**
 * Places an edit in the document, or refuses it. A replacement's anchors must
 * be exactly the characters on either side of the caret within its own block:
 * inside one textblock a character is one position, so the lengths map, and the
 * text comparison catches an inline atom or a stale answer. Anything else is
 * refused rather than guessed, because a replacement on the wrong characters
 * would destroy the writer's text.
 */
const offerOf = (
	state: EditorState,
	edit: InlineSuggestionEdit,
	origin: number
): InlineSuggestionOffer | undefined => {
	if (edit.kind === 'insert') return { kind: 'insert', from: origin, text: edit.text };
	const $origin = state.doc.resolve(origin);
	const from = origin - edit.replaceBefore.length;
	const to = origin + edit.replaceAfter.length;
	if (from < $origin.start() || to > $origin.end()) return undefined;
	if (state.doc.textBetween(from, origin) !== edit.replaceBefore) return undefined;
	if (state.doc.textBetween(origin, to) !== edit.replaceAfter) return undefined;
	return { kind: 'replace', from, to, text: edit.text };
};

/**
 * The text a transaction typed straight into an offer, when it is exactly that:
 * one insertion at the offer's position whose characters open the offer. Input
 * rules, pasted slices and composition are shaped differently and fall through.
 */
const typedInto = (
	transaction: Transaction,
	offer: Extract<InlineSuggestionOffer, { kind: 'insert' }>
): string | undefined => {
	if (transaction.steps.length !== 1) return undefined;
	const [step] = transaction.steps;
	if (!(step instanceof ReplaceStep) || step.from !== offer.from || step.to !== offer.from)
		return undefined;
	const { slice } = step;
	if (slice.openStart !== 0 || slice.openEnd !== 0 || slice.content.childCount !== 1)
		return undefined;
	const typed = slice.content.firstChild?.text;
	return typed && offer.text.startsWith(typed) ? typed : undefined;
};

/** A printable key continues an appended offer when it is the offer's next character. */
const continuesOffer = (event: KeyboardEvent, offer: InlineSuggestionOffer): boolean =>
	offer.kind === 'insert' &&
	event.key.length === 1 &&
	!event.ctrlKey &&
	!event.metaKey &&
	!event.altKey &&
	offer.text.startsWith(event.key);

export const InlineSuggestion = Extension.create<InlineSuggestionOptions, InlineSuggestionStorage>({
	name: 'inlineSuggestion',
	// Above the editor's own Tab handling so accepting never indents a list.
	priority: 120,

	addOptions() {
		return { idleDelayMs: 400, enabled: true };
	},

	addStorage() {
		return { setEnabled: () => undefined, trigger: () => undefined };
	},

	addCommands() {
		return {
			setInlineSuggestionsEnabled: (enabled) => () => {
				this.storage.setEnabled(enabled);
				return true;
			},
			// Always handled, even when nothing is eligible: on macOS the chord
			// would otherwise type a guillemet into the note.
			triggerInlineSuggestion: () => () => {
				this.storage.trigger();
				return true;
			}
		};
	},

	addKeyboardShortcuts() {
		return { 'Alt-\\': () => this.editor.commands.triggerInlineSuggestion() };
	},

	addProseMirrorPlugins() {
		const options = this.options;
		const editor = this.editor;
		const cache = new InlineSuggestionCache();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let inFlight: AbortController | undefined;
		/** Set by Escape: no new offer until the writer edits or asks. */
		let requiresEdit = false;
		let composing = false;
		/**
		 * The writer has typed or clicked in this editor. Until then a resting
		 * caret is the app placing it on open, not a person pausing to think.
		 */
		let touched = false;
		let shouldSchedule = false;
		/** An offer typed out to its end is an acceptance: ask again without a pause. */
		let requestNow = false;
		/** Where a `retry` answer has already been retried; one is enough. */
		let retriedAt: number | undefined;
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

		const offer = (view: EditorView, edit: InlineSuggestionEdit, origin: number) => {
			const placed = offerOf(view.state, edit, origin);
			if (!placed) return;
			view.dispatch(
				view.state.tr.setMeta(inlineSuggestionKey, {
					offer: placed,
					// Shown on every suggestion, not just the first: without a
					// persistent affordance a re-triggered suggestion reads as
					// plain grey text and is easy to miss.
					showHint: !acceptedThisSession,
					arrival: 'new'
				} satisfies InlineSuggestionMeta)
			);
			announce(placed.kind === 'replace' ? EDIT_AVAILABLE : AVAILABLE);
		};

		const settle = (
			view: EditorView,
			result: InlineSuggestionResult,
			origin: number,
			at: CaretText,
			trigger: InlineSuggestionTrigger
		) => {
			switch (result.kind) {
				case 'offer':
					// A replacement is tied to the exact characters it replaces, which the
					// next keystroke changes; only an appended offer is worth remembering.
					if (result.edit.kind === 'insert') cache.remember(at, result.edit);
					offer(view, result.edit, origin);
					return;
				case 'none':
					return;
				case 'retry':
					// Once per spot: the budget frees up at the time the server named, so
					// a second refusal there means someone else spent it, and asking
					// again would only spend more.
					if (retriedAt === origin) return;
					retriedAt = origin;
					timer = setTimeout(() => {
						timer = undefined;
						if (view.state.selection.$from.pos === origin) request(view, trigger);
					}, result.afterMs);
					return;
				case 'failure':
					announce(UNAVAILABLE);
					return;
			}
		};

		const request = (view: EditorView, trigger: InlineSuggestionTrigger) => {
			const fetchSuggestion = options.fetchSuggestion;
			if (!fetchSuggestion) return;
			if (!options.enabled || composing) return;
			// Focus is checked here rather than at schedule time: a programmatic
			// caret move lands the selection change before DOM focus settles, and
			// gating the schedule on focus would drop that first suggestion.
			if (!view.hasFocus()) return;
			if (!shouldTrigger(caretContextOf(view.state, requiresEdit))) return;
			const origin = view.state.selection.$from.pos;
			const at = caretTextOf(view.state);
			const controller = new AbortController();
			inFlight = controller;
			// chisel-ignore fail-loudly:silent-catch -- failed speculative suggestions are announced as unavailable and never alter the document.
			void fetchSuggestion({ ...caretWindowOf(view.state), trigger }, controller.signal)
				.then((result) => {
					// The caret moved or another request started while we waited:
					// the answer describes a position that no longer exists.
					if (controller.signal.aborted || inFlight !== controller) return;
					inFlight = undefined;
					if (view.state.selection.$from.pos !== origin) return;
					settle(view, result, origin, at, trigger);
				})
				.catch(() => {
					if (inFlight === controller) inFlight = undefined;
					announce(UNAVAILABLE);
				});
		};

		/** A remembered offer the caret still sits inside, when one may be shown. */
		const recall = (view: EditorView) => {
			if (!options.enabled || composing || !view.hasFocus()) return undefined;
			if (!shouldTrigger(caretContextOf(view.state, requiresEdit))) return undefined;
			const edit = cache.recall(caretTextOf(view.state));
			return edit && { edit, origin: view.state.selection.$from.pos };
		};

		/** Shows a remembered offer at once, or asks once the caret has rested. */
		const schedule = (view: EditorView) => {
			cancel();
			retriedAt = undefined;
			const recalled = recall(view);
			if (recalled) {
				// One tick later: this runs inside the view update of the edit itself.
				queueMicrotask(() => {
					if (inlineSuggestionKey.getState(view.state)) return;
					if (view.state.selection.$from.pos !== recalled.origin) return;
					offer(view, recalled.edit, recalled.origin);
				});
				return;
			}
			timer = setTimeout(() => {
				timer = undefined;
				request(view, 'idle');
			}, options.idleDelayMs);
		};

		const accept = (view: EditorView): boolean => {
			const current = inlineSuggestionKey.getState(view.state);
			if (!current) return false;
			const { from, text } = current.offer;
			const to = current.offer.kind === 'replace' ? current.offer.to : from;
			const characterBefore = view.state.doc.textBetween(Math.max(0, from - 1), from);
			cancel();
			view.dispatch(
				view.state.tr
					.insertText(joinedSuggestion(characterBefore, text), from, to)
					.setMeta(inlineSuggestionKey, null as InlineSuggestionMeta)
			);
			acceptedThisSession = true;
			if (typeof sessionStorage !== 'undefined')
				sessionStorage.setItem('inline-suggestion-accepted', '1');
			view.focus();
			// Accepting is the clearest sign the writer wants more: ask for the next
			// continuation at once rather than after another pause.
			request(view, 'idle');
			return true;
		};

		const ghostOf = (current: InlineSuggestionState): HTMLElement => {
			const span = document.createElement('span');
			span.className =
				current.arrival === 'continued'
					? 'inline-suggestion inline-suggestion-continued'
					: 'inline-suggestion';
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
			span.textContent = current.offer.text;
			if (current.showHint) {
				const hint = document.createElement('span');
				hint.className = 'inline-suggestion-hint';
				hint.textContent = 'Tab or click';
				span.append(hint);
			}
			return span;
		};

		this.storage.setEnabled = (enabled) => {
			options.enabled = enabled;
			if (!enabled) clear(editor.view);
		};

		this.storage.trigger = () => {
			touched = true;
			requiresEdit = false;
			clear(editor.view);
			request(editor.view, 'explicit');
		};

		return [
			new Plugin<InlineSuggestionState | null>({
				key: inlineSuggestionKey,

				state: {
					init: () => null,
					apply(
						transaction: Transaction,
						current: InlineSuggestionState | null,
						_previous: EditorState,
						next: EditorState
					) {
						shouldSchedule = false;
						const meta = transaction.getMeta(inlineSuggestionKey) as
							InlineSuggestionMeta | undefined;
						if (meta !== undefined) return meta;
						if (transaction.docChanged) {
							const typed =
								current && current.offer.kind === 'insert' && typedInto(transaction, current.offer);
							if (current && typed) {
								const rest = current.offer.text.slice(typed.length);
								if (rest)
									return {
										offer: { kind: 'insert', from: current.offer.from + typed.length, text: rest },
										showHint: current.showHint,
										arrival: 'continued'
									};
								// Typed to its end: the writer took the whole offer by hand.
								requestNow = true;
								return null;
							}
							// Any other edit invalidates the offered text.
							const uiEvent = transaction.getMeta('uiEvent');
							shouldSchedule =
								uiEvent !== 'paste' &&
								uiEvent !== 'cut' &&
								uiEvent !== 'drop' &&
								!transaction.getMeta('history$');
							requiresEdit = false;
							return null;
						}
						if (transaction.selectionSet) {
							// A caret that moved also invalidates the offer, and a writer who
							// parks it at the end of a block is pausing to think.
							shouldSchedule = touched && caretRestsForSuggestion(next);
							return null;
						}
						return current;
					}
				},

				props: {
					decorations(state: EditorState) {
						const current = inlineSuggestionKey.getState(state);
						if (!current) return null;
						const { offer } = current;
						const ghostAt = offer.kind === 'replace' ? offer.to : offer.from;
						// A stable key keeps the rendered span across unrelated
						// transactions (autosave, proofreading); without one every
						// redraw rebuilds it and replays the fade.
						const key = `${offer.kind}:${offer.from}:${ghostAt}:${offer.text}:${current.showHint}:${current.arrival}`;
						return DecorationSet.create(state.doc, [
							...(offer.kind === 'replace'
								? [Decoration.inline(offer.from, offer.to, { class: 'inline-suggestion-removed' })]
								: []),
							Decoration.widget(ghostAt, () => ghostOf(current), { side: 1, marks: [], key })
						]);
					},

					handleKeyDown(view: EditorView, event: KeyboardEvent) {
						touched = true;
						const current = inlineSuggestionKey.getState(view.state);
						if (!current) return false;
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
						if (MODIFIER_KEYS.has(event.key)) return false;
						// The predicted letter: let it land, and `apply` shortens the offer by it.
						if (continuesOffer(event, current.offer)) return false;
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
					const onPointerDown = () => {
						touched = true;
					};
					// A click into an unfocused editor often lands where the caret already
					// was, so no selection transaction follows; the focus it brings is the
					// writer settling in all the same.
					const onFocus = () => {
						if (touched && caretRestsForSuggestion(view.state)) schedule(view);
					};
					const onCompositionStart = () => {
						composing = true;
						clear(view);
					};
					const onCompositionEnd = () => {
						composing = false;
					};
					dom.addEventListener('blur', onBlur, true);
					dom.addEventListener('focus', onFocus, true);
					dom.addEventListener('pointerdown', onPointerDown, true);
					dom.addEventListener('compositionstart', onCompositionStart);
					dom.addEventListener('compositionend', onCompositionEnd);
					return {
						update(updated: EditorView, previous: EditorState) {
							if (requestNow) {
								requestNow = false;
								request(updated, 'idle');
								return;
							}
							// A caret that moved without an edit: anything still pending
							// describes the place it left.
							if (
								updated.state.doc.eq(previous.doc) &&
								!updated.state.selection.eq(previous.selection)
							)
								cancel();
							if (!shouldSchedule) return;
							shouldSchedule = false;
							if (inlineSuggestionKey.getState(updated.state)) return;
							schedule(updated);
						},
						destroy() {
							dom.removeEventListener('blur', onBlur, true);
							dom.removeEventListener('focus', onFocus, true);
							dom.removeEventListener('pointerdown', onPointerDown, true);
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
