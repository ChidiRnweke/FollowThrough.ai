import {
	proofreadSuggestion,
	type ProofreadIssue,
	type ProofreadLinter,
	type ProofreadSuggestion
} from '$lib/models/proofreading';
import type { Lint, Linter, Suggestion } from 'harper.js';

/** The checker is a browser capability; SSR renders the document without it. */
const inBrowser = (): boolean => typeof window !== 'undefined';

/**
 * Harper behind the editor's proofreading contract.
 *
 * Everything about this adapter is arranged around one fact: the checker is a
 * ~16 MB WebAssembly binary. It is therefore imported dynamically and only on the
 * first lint, so a user who never opens a note never pays for it, and it runs in
 * Harper's `WorkerLinter` rather than `LocalLinter` so compiling it does not
 * block the main thread while someone is typing into the document it is checking.
 *
 * Harper is English-only — the dialects it exposes are all dialects of English —
 * so there is deliberately no language selection here.
 */
export class HarperLinter implements ProofreadLinter {
	/** Resolved once and shared: two panes must not each boot a worker. */
	private started?: Promise<{ linter: Linter; kinds: SuggestionKinds }>;
	/** Words taught before the linter finished loading, replayed on arrival. */
	private readonly pending: string[] = [];

	private start(): Promise<{ linter: Linter; kinds: SuggestionKinds }> {
		this.started ??= (async () => {
			const [{ WorkerLinter, SuggestionKind }, { binary }] = await Promise.all([
				import('harper.js'),
				import('harper.js/binary')
			]);
			const linter = new WorkerLinter({ binary });
			await linter.setup();
			const kinds: SuggestionKinds = {
				remove: SuggestionKind.Remove,
				insertAfter: SuggestionKind.InsertAfter
			};
			if (this.pending.length > 0) {
				await linter.importWords(this.pending.splice(0));
			}
			return { linter, kinds };
		})();
		return this.started;
	}

	async setup(): Promise<void> {
		if (!inBrowser()) return;
		await this.start();
	}

	async lint(text: string): Promise<readonly ProofreadIssue[]> {
		// SSR renders the document without decorations; the first client pass adds them.
		if (!inBrowser() || text.trim() === '') return [];
		const { linter, kinds } = await this.start();
		// `plaintext`, not the default `markdown`: the editor hands over the text of
		// one block at a time, already stripped of its formatting. Letting Harper
		// parse it as Markdown would read a leading `#` in prose as a heading and a
		// bare `_` as emphasis, and silently shift every offset that follows.
		const lints = await linter.lint(text, { language: 'plaintext', dedup: true });
		try {
			return lints.map((lint) => toIssue(lint, kinds));
		} finally {
			// These are handles into WebAssembly memory that Harper will not reclaim
			// on its own. A note is re-linted on every typing pause, so leaking one
			// per issue per pass is a leak measured in minutes.
			for (const lint of lints) free(lint);
		}
	}

	async addWord(word: string): Promise<void> {
		if (!inBrowser()) return;
		// Queued rather than awaited: "Add to dictionary" must feel instant, and the
		// linter may still be downloading the first time it is used.
		if (!this.started) {
			this.pending.push(word);
			void this.start();
			return;
		}
		const { linter } = await this.started;
		await linter.importWords([word]);
	}

	/** Release the worker. Called when the last editor using it goes away. */
	async dispose(): Promise<void> {
		const started = this.started;
		this.started = undefined;
		if (!started) return;
		const { linter } = await started;
		await linter.dispose();
	}
}

interface SuggestionKinds {
	readonly remove: number;
	readonly insertAfter: number;
}

const toIssue = (lint: Lint, kinds: SuggestionKinds): ProofreadIssue => {
	const span = lint.span();
	const text = lint.get_problem_text();
	try {
		return {
			start: span.start,
			end: span.end,
			message: lint.message(),
			kind: lint.lint_kind(),
			text,
			suggestions: lint.suggestions().map((suggestion) => toSuggestion(suggestion, text, kinds))
		};
	} finally {
		free(span);
	}
};

const toSuggestion = (
	suggestion: Suggestion,
	problemText: string,
	kinds: SuggestionKinds
): ProofreadSuggestion => {
	try {
		const kind = suggestion.kind() as number;
		if (kind === kinds.remove) return proofreadSuggestion('remove', '', problemText);
		return proofreadSuggestion(
			kind === kinds.insertAfter ? 'insertAfter' : 'replace',
			suggestion.get_replacement_text(),
			problemText
		);
	} finally {
		free(suggestion);
	}
};

/**
 * Harper's handles are freed defensively. A double free throws, and a leak that
 * only shows up as a crash while someone is writing is worse than a leak.
 */
const free = (handle: { free(): void }): void => {
	try {
		handle.free();
	} catch {
		// Already reclaimed.
	}
};
