import { SvelteSet } from 'svelte/reactivity';
import type { ProofreadLinter } from '$lib/controllers/notes/proofreading';
export interface ProofreadingState {
	readonly enabled: boolean;
	readonly dictionary: ReadonlySet<string>;
	readonly linter: ProofreadLinter | undefined;
	setEnabled(enabled: boolean): void;
	remember(word: string): void;
	setLinter(linter: ProofreadLinter): void;
}
export class ProofreadingStore implements ProofreadingState {
	enabled = $state(true);
	readonly dictionary = new SvelteSet<string>();
	linter: ProofreadLinter | undefined;
	setEnabled(enabled: boolean) {
		this.enabled = enabled;
	}
	remember(word: string) {
		this.dictionary.add(word);
	}
	setLinter(linter: ProofreadLinter) {
		this.linter = linter;
	}
}
