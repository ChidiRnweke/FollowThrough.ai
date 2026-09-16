/**
 * What a proofreading pass produces, stated independently of the checker behind
 * it. Harper hands back WebAssembly handles whose memory it owns; everything
 * above this line works with plain data, so nothing outside the adapter has to
 * know a linter can be freed out from under it, and a different checker could be
 * swapped in without touching the editor.
 */

/** One offered fix, already reduced to the text the flagged span becomes. */
export interface ProofreadSuggestion {
	/** What the menu shows. */
	readonly label: string;
	/** What the flagged span becomes when this is applied. Empty means delete it. */
	readonly replacement: string;
}

export interface ProofreadIssue {
	/** Character offset into the linted text, inclusive. */
	readonly start: number;
	/** Character offset into the linted text, exclusive. */
	readonly end: number;
	/** Plain-language description of the problem. */
	readonly message: string;
	/** The checker's own category — `Spelling`, `Grammar`, `Style`, … */
	readonly kind: string;
	/** The offending text itself, so a decoration can be matched back to a word. */
	readonly text: string;
	readonly suggestions: readonly ProofreadSuggestion[];
}
