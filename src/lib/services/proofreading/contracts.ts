import type { ProofreadIssue } from '$lib/models/proofreading';

/** Lints a run of prose. Implemented by the Harper adapter and by the test fake. */
export interface ProofreadLinter {
	/**
	 * Do whatever loading is needed before the first lint. Optional to call —
	 * `lint` completes it regardless — but calling it while the user is reading
	 * moves a multi-megabyte download off the first keystroke.
	 */
	setup(): Promise<void>;
	lint(text: string): Promise<readonly ProofreadIssue[]>;
	/** Teach the checker a word so it stops being flagged. */
	addWord(word: string): Promise<void>;
}
