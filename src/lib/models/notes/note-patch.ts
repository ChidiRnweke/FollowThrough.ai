/**
 * Targeted replacements inside a note's Markdown.
 *
 * Anchors are exact strings rather than line numbers or diff hunks: a model quotes text
 * far more reliably than it counts lines, and uniqueness is a precondition that can be
 * checked, so a bad anchor fails loudly instead of applying at the wrong offset.
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
	| { readonly ok: true; readonly markdown: string; readonly appliedEdits: number }
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

const normalise = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * Best-matching window of the note for an anchor that did not match.
 *
 * Scored on normalised whitespace, because the usual cause is indentation, a smart
 * quote, or a Markdown escape the model did not reproduce — differences that vanish
 * once the run of whitespace is collapsed.
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
			const nearest = nearestText(working, oldText);
			failures.push({ reason: 'not_found', editIndex, oldText, ...(nearest ? { nearest } : {}) });
			return;
		}
		if (occurrences > 1 && edit.replaceAll !== true) {
			failures.push({ reason: 'ambiguous', editIndex, oldText, occurrences });
			return;
		}

		working = edit.replaceAll
			? working.split(oldText).join(newText)
			: working.replace(oldText, newText);
	});

	if (failures.length > 0) return { ok: false, failures };
	return { ok: true, markdown: working, appliedEdits: edits.length };
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
