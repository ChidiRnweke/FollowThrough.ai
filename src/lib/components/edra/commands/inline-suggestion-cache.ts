import type { CaretText } from './inline-suggestion-trigger';
import type { InlineSuggestionEdit } from './InlineSuggestion';

interface Remembered extends CaretText {
	readonly edit: InlineSuggestionEdit;
}

/**
 * Suggestions already paid for at the spot the writer is still in.
 *
 * Typing the first letters of an offer keeps it on screen without a round trip,
 * and a Backspace brings back what those letters had hidden — the way code
 * editors remember a completion once shown. Entries are keyed by the text around
 * the caret, not by positions, so nothing has to be mapped through edits. Every
 * recall also evicts whatever no longer fits the text, which keeps the set to the
 * offers made at the current spot and needs no size limit.
 */
export class InlineSuggestionCache {
	private remembered: readonly Remembered[] = [];

	remember(at: CaretText, edit: InlineSuggestionEdit): void {
		this.remembered = [
			...this.remembered.filter((entry) => entry.before !== at.before || entry.after !== at.after),
			{ ...at, edit }
		];
	}

	/** The unseen rest of the newest remembered offer the caret still sits inside. */
	recall(at: CaretText): InlineSuggestionEdit | undefined {
		const fitting = this.remembered.flatMap((entry) => {
			const rest = restOf(entry, at);
			return rest ? [{ entry, rest }] : [];
		});
		this.remembered = fitting.map(({ entry }) => entry);
		return fitting.at(-1)?.rest;
	}
}

const restOf = (entry: Remembered, at: CaretText): InlineSuggestionEdit | undefined => {
	if (entry.after !== at.after || !at.before.startsWith(entry.before)) return undefined;
	const typed = at.before.slice(entry.before.length);
	// Typed past the offer, or away from it: the entry has nothing left to show.
	if (typed.length >= entry.edit.text.length || !entry.edit.text.startsWith(typed))
		return undefined;
	return { kind: 'insert', text: entry.edit.text.slice(typed.length) };
};
