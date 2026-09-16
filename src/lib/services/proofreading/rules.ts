import type { ProofreadIssue, ProofreadSuggestion } from '$lib/models/proofreading';

/**
 * The categories that mean "this is not a word" rather than "this could be
 * written better". Only these are silenced by adding a word to the dictionary,
 * and only these get the spelling underline — a dictionary entry has nothing to
 * say about a run-on sentence.
 */
const spellingKinds = new Set(['Spelling', 'Typo', 'Malapropism', 'Eggcorn']);

export const isSpellingIssue = (issue: ProofreadIssue): boolean => spellingKinds.has(issue.kind);

/**
 * The form a word is stored and compared in. Case is folded because a word is no
 * less known at the start of a sentence, and surrounding punctuation is dropped
 * because the checker flags `Nweke,` as readily as `Nweke` and the writer means
 * to teach it the name either way. Interior marks stay: `don't` and `dont` are
 * different words, and `co-op` is one.
 */
export const normalizeDictionaryWord = (word: string): string =>
	word
		.trim()
		.replace(/^[^\p{L}\p{N}]+/u, '')
		.replace(/[^\p{L}\p{N}]+$/u, '')
		.toLocaleLowerCase();

/**
 * The word an issue would teach the dictionary, or `undefined` when it would
 * teach it nothing useful. A multi-word span and an empty span are both rejected:
 * "Add to dictionary" on a whole clause would silence a grammar rule by pretending
 * the clause is a word, which is how a personal dictionary fills up with sentences.
 */
export const dictionaryWordFor = (issue: ProofreadIssue): string | undefined => {
	if (!isSpellingIssue(issue)) return undefined;
	const word = normalizeDictionaryWord(issue.text);
	if (word === '' || /\s/u.test(word)) return undefined;
	return word;
};

/**
 * Drop the issues the writer has already answered. Words are matched on their
 * normalized form; anything that is not a spelling complaint passes through,
 * since the dictionary has no opinion on it.
 */
export const withoutIgnoredWords = (
	issues: readonly ProofreadIssue[],
	ignored: ReadonlySet<string>
): readonly ProofreadIssue[] => {
	if (ignored.size === 0) return issues;
	return issues.filter((issue) => {
		const word = dictionaryWordFor(issue);
		return word === undefined || !ignored.has(word);
	});
};

/**
 * Reduce a checker's suggestion to the text the flagged span becomes.
 *
 * The three kinds exist because the checker distinguishes them, but the editor
 * has one operation — replace this range — so they are collapsed here rather
 * than carried through every layer. `insertAfter` keeps the problem text and
 * appends, which is how a missing comma is offered without deleting the word it
 * follows.
 */
export const proofreadSuggestion = (
	kind: 'replace' | 'remove' | 'insertAfter',
	text: string,
	problemText: string
): ProofreadSuggestion => {
	if (kind === 'remove') return { label: 'Remove', replacement: '' };
	const replacement = kind === 'insertAfter' ? `${problemText}${text}` : text;
	// A suggestion that replaces with whitespace reads as a blank row in the menu.
	return { label: replacement.trim() === '' ? 'Remove' : replacement, replacement };
};
