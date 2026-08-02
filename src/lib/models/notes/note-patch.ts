/**
 * Targeted replacements inside a note's Markdown.
 *
 * Anchors are exact strings rather than line numbers or diff hunks: a model quotes text
 * far more reliably than it counts lines, and uniqueness is a precondition that can be
 * checked, so a bad anchor fails loudly instead of applying at the wrong offset.
 *
 * Matching is precision-ordered, following the approach Aider's search/replace engine
 * uses: an exact string match first, then a whitespace- and punctuation-tolerant match
 * (indentation, double spaces, smart quotes, em dashes) that is applied only when it is
 * unique — never a general fuzzy/similarity match, which silently applies at the wrong
 * offset. A non-unique or absent anchor still fails loudly with the nearest text, so the
 * model can correct itself.
 *
 * Pure and isomorphic — the agent tool applies these on the server, and the approval
 * card previews the same result in the browser before anyone accepts it.
 */

export interface NoteEdit {
	readonly oldText: string;
	readonly newText: string;
	/** Replace every occurrence instead of requiring the anchor to be unique. */
	readonly replaceAll?: boolean;
}

export type NotePatchFailure =
	| {
			readonly reason: 'not_found';
			readonly editIndex: number;
			readonly oldText: string;
			/** Closest text in the note, so the model can see what it got wrong. */
			readonly nearest?: string;
	  }
	| {
			readonly reason: 'ambiguous';
			readonly editIndex: number;
			readonly oldText: string;
			readonly occurrences: number;
	  }
	| { readonly reason: 'no_op'; readonly editIndex: number }
	| { readonly reason: 'empty_anchor'; readonly editIndex: number };

export type NotePatchResult =
	| {
			readonly ok: true;
			readonly markdown: string;
			readonly appliedEdits: number;
			/** The text each edit actually replaced; a tolerant match may differ from oldText. */
			readonly matchedTexts: readonly string[];
	  }
	| { readonly ok: false; readonly failures: readonly NotePatchFailure[] };

const countOccurrences = (haystack: string, needle: string): number => {
	let count = 0;
	let index = haystack.indexOf(needle);
	while (index !== -1) {
		count += 1;
		index = haystack.indexOf(needle, index + needle.length);
	}
	return count;
};

/** Fold typographic punctuation to the plain form a model is likely to reproduce. */
const normaliseChar = (char: string): string => {
	switch (char) {
		case '\u2018':
		case '\u2019':
			return "'";
		case '\u201C':
		case '\u201D':
			return '"';
		case '\u2013':
		case '\u2014':
			return '-';
		case '\u2026':
			return '...';
		default:
			return char;
	}
};

/**
 * Collapse every whitespace run to a single space and fold typographic punctuation,
 * keeping a per-output-character map back to the original string so a tolerant match
 * can be located (and replaced) in the untouched source.
 */
const normaliseWithMap = (value: string): { text: string; map: number[] } => {
	const text: string[] = [];
	const map: number[] = [];
	let pendingSpace = false;
	for (let i = 0; i < value.length; i += 1) {
		const char = value[i];
		if (/\s/.test(char)) {
			pendingSpace = true;
			continue;
		}
		if (pendingSpace && text.length > 0) {
			text.push(' ');
			map.push(i - 1);
		}
		pendingSpace = false;
		for (const output of normaliseChar(char)) {
			text.push(output);
			map.push(i);
		}
	}
	return { text: text.join(''), map };
};

const normalise = (value: string): string => normaliseWithMap(value).text;

/**
 * Every span of the note whose normalised text equals the normalised anchor. The
 * matched span is the untouched source text, so a tolerant replacement replaces
 * exactly what was matched, padding and punctuation included.
 */
const tolerantMatches = (
	markdown: string,
	oldText: string
): readonly { text: string; index: number }[] => {
	const { text: source, map } = normaliseWithMap(markdown);
	const target = normaliseWithMap(oldText).text;
	if (!target) return [];
	const matches: { text: string; index: number }[] = [];
	let searchFrom = 0;
	let at = source.indexOf(target, searchFrom);
	while (at !== -1) {
		const from = map[at];
		const to = map[at + target.length - 1] + 1;
		matches.push({ text: markdown.slice(from, to), index: from });
		searchFrom = at + target.length;
		at = source.indexOf(target, searchFrom);
	}
	return matches;
};

/**
 * Best-matching window of the note for an anchor that did not match.
 *
 * Scored on normalised whitespace and punctuation, because the usual cause is
 * indentation, a smart quote, or a Markdown escape the model did not reproduce —
 * differences that vanish once whitespace is collapsed and typographic punctuation
 * is folded to its plain form.
 */
const nearestText = (markdown: string, oldText: string): string | undefined => {
	const target = normalise(oldText);
	if (!target) return undefined;
	const lines = markdown.split('\n');
	const span = Math.max(1, oldText.split('\n').length);
	let best: { score: number; text: string } | undefined;
	for (let start = 0; start + span <= lines.length; start += 1) {
		const window = lines.slice(start, start + span).join('\n');
		const candidate = normalise(window);
		if (!candidate) continue;
		const shorter = candidate.length < target.length ? candidate : target;
		const longer = candidate.length < target.length ? target : candidate;
		let shared = 0;
		while (shared < shorter.length && shorter[shared] === longer[shared]) shared += 1;
		const score = shared / longer.length;
		if (!best || score > best.score) best = { score, text: window };
	}
	return best && best.score > 0.3 ? best.text : undefined;
};

/**
 * Apply every edit, or none.
 *
 * Edits are sequential, so a later anchor may match text an earlier edit produced. A
 * partial application is worse than a clean rejection here: the caller saves the whole
 * body, so a half-applied patch is a silently corrupted note rather than a failed one.
 */
export const applyNotePatch = (markdown: string, edits: readonly NoteEdit[]): NotePatchResult => {
	const failures: NotePatchFailure[] = [];
	const matchedTexts: string[] = [];
	let working = markdown.replace(/\r\n/g, '\n');

	edits.forEach((edit, editIndex) => {
		const oldText = edit.oldText.replace(/\r\n/g, '\n');
		const newText = edit.newText.replace(/\r\n/g, '\n');

		if (oldText === '') {
			failures.push({ reason: 'empty_anchor', editIndex });
			return;
		}
		if (oldText === newText) {
			failures.push({ reason: 'no_op', editIndex });
			return;
		}

		const occurrences = countOccurrences(working, oldText);
		if (occurrences === 0) {
			// The anchor was not found verbatim; fall back to a whitespace- and
			// punctuation-tolerant match, applied only when it is unique.
			const tolerant = tolerantMatches(working, oldText);
			if (tolerant.length > 0 && (tolerant.length === 1 || edit.replaceAll)) {
				for (const match of [...tolerant].sort((a, b) => b.index - a.index)) {
					working =
						working.slice(0, match.index) +
						newText +
						working.slice(match.index + match.text.length);
					matchedTexts.push(match.text);
				}
				return;
			}
			if (tolerant.length > 1) {
				failures.push({
					reason: 'ambiguous',
					editIndex,
					oldText,
					occurrences: tolerant.length
				});
				return;
			}
			const nearest = nearestText(working, oldText);
			failures.push({ reason: 'not_found', editIndex, oldText, ...(nearest ? { nearest } : {}) });
			return;
		}
		if (occurrences > 1 && edit.replaceAll !== true) {
			failures.push({ reason: 'ambiguous', editIndex, oldText, occurrences });
			return;
		}

		matchedTexts.push(oldText);
		working = edit.replaceAll
			? working.split(oldText).join(newText)
			: working.replace(oldText, newText);
	});

	if (failures.length > 0) return { ok: false, failures };
	return { ok: true, markdown: working, appliedEdits: edits.length, matchedTexts };
};

/** One line a model can act on, for each way a patch can be rejected. */
export const describeNotePatchFailure = (failure: NotePatchFailure): string => {
	switch (failure.reason) {
		case 'empty_anchor':
			return `Edit ${failure.editIndex + 1}: oldText is empty. Quote the text you want to replace.`;
		case 'no_op':
			return `Edit ${failure.editIndex + 1}: oldText and newText are identical, so there is nothing to change.`;
		case 'ambiguous':
			return `Edit ${failure.editIndex + 1}: oldText appears ${failure.occurrences} times. Quote more surrounding text to make it unique, or set replaceAll.`;
		case 'not_found':
			return failure.nearest
				? `Edit ${failure.editIndex + 1}: oldText was not found. The closest text in the note is:\n${failure.nearest}`
				: `Edit ${failure.editIndex + 1}: oldText was not found. Read the note again and quote it exactly.`;
	}
};
