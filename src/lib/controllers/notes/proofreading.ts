import type {
	ProofreadIssue,
	ProofreadCandidate,
	StoredProofreadingDictionary
} from '$lib/models/proofreading';
import type { ProofreadingState } from '$lib/stores/notes/proofreading.svelte';

import type { ProofreadingRules } from '$lib/services/proofreading/rules';

export interface ProofreadLinter {
	setup(): Promise<void>;
	lint(text: string): Promise<readonly ProofreadCandidate[]>;
	addWord(word: string): Promise<void>;
}
export interface ProofreadingPreferences {
	read(): { enabled: boolean; dictionary: StoredProofreadingDictionary } | undefined;
	setEnabled(enabled: boolean): void;
	saveWords(words: readonly string[]): void;
	resetCorruptDictionary(): void;
}
export interface ProofreadingController {
	readonly enabled: boolean;
	readonly dictionary: ReadonlySet<string>;
	hydrate(): void;
	proofread(text: string): Promise<readonly ProofreadIssue[]>;
	setEnabled(enabled: boolean): void;
	addWord(word: string): void;
	accepted(issues: readonly ProofreadIssue[]): readonly ProofreadIssue[];
	dictionaryWordFor(issue: ProofreadIssue): string | undefined;
}
export class Proofreading implements ProofreadingController {
	constructor(
		private readonly state: ProofreadingState,
		private readonly preferences: ProofreadingPreferences,
		private readonly rules: ProofreadingRules,
		private readonly createLinter: () => ProofreadLinter
	) {}
	get enabled() {
		return this.state.enabled;
	}
	get dictionary() {
		return this.state.dictionary;
	}
	readonly dictionaryWordFor = (issue: ProofreadIssue): string | undefined =>
		this.rules.dictionaryWordFor(issue);
	hydrate(): void {
		const saved = this.preferences.read();
		if (!saved) return;
		this.state.setEnabled(saved.enabled);
		if (saved.dictionary.kind === 'corrupt') {
			this.preferences.resetCorruptDictionary();
			return;
		}
		for (const word of saved.dictionary.words) this.state.remember(word);
	}
	private linter(): ProofreadLinter {
		if (this.state.linter) return this.state.linter;
		const linter = this.createLinter();
		this.state.setLinter(linter);
		return linter;
	}
	setEnabled(enabled: boolean): void {
		this.state.setEnabled(enabled);
		this.preferences.setEnabled(enabled);
		if (enabled) void this.linter().setup();
	}
	addWord(word: string): void {
		const normalized = this.rules.normalizeDictionaryWord(word);
		if (normalized === '' || this.state.dictionary.has(normalized)) return;
		this.state.remember(normalized);
		this.preferences.saveWords([...this.state.dictionary]);
		void this.linter().addWord(normalized);
	}
	async proofread(text: string): Promise<readonly ProofreadIssue[]> {
		const issues = await this.linter().lint(text);
		return this.accepted(
			issues.map((issue) => ({
				...issue,
				suggestions: issue.suggestions.map((suggestion) =>
					this.rules.proofreadSuggestion(suggestion.kind, suggestion.text, issue.text)
				)
			}))
		);
	}
	accepted(issues: readonly ProofreadIssue[]) {
		return this.rules.withoutIgnoredWords(issues, this.state.dictionary);
	}
}
