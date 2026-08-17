import { describe, expect, it } from 'vitest';
import {
	dictionaryWordFor,
	isSpellingIssue,
	normalizeDictionaryWord,
	proofreadSuggestion,
	withoutIgnoredWords,
	type ProofreadIssue
} from './proofreading';

const issue = (overrides: Partial<ProofreadIssue> = {}): ProofreadIssue => ({
	start: 0,
	end: 5,
	message: 'Did you mean to spell this differently?',
	kind: 'Spelling',
	text: 'Nweke',
	suggestions: [],
	...overrides
});

describe('normalizeDictionaryWord', () => {
	it('folds case so a word is not relearned at the start of a sentence', () => {
		expect(normalizeDictionaryWord('Nweke')).toBe('nweke');
	});

	it('drops trailing punctuation the checker happened to include', () => {
		expect(normalizeDictionaryWord('Nweke,')).toBe('nweke');
	});

	it('keeps interior marks, because co-op is one word', () => {
		expect(normalizeDictionaryWord('co-op')).toBe('co-op');
	});
});

describe('isSpellingIssue', () => {
	it('treats a typo as a spelling problem', () => {
		expect(isSpellingIssue(issue({ kind: 'Typo' }))).toBe(true);
	});

	it('does not treat a style note as a spelling problem', () => {
		expect(isSpellingIssue(issue({ kind: 'Style' }))).toBe(false);
	});
});

describe('dictionaryWordFor', () => {
	it('offers the normalized word for a misspelling', () => {
		expect(dictionaryWordFor(issue())).toBe('nweke');
	});

	it('offers nothing for a grammar complaint, which a dictionary cannot answer', () => {
		expect(dictionaryWordFor(issue({ kind: 'Grammar' }))).toBeUndefined();
	});

	it('refuses a multi-word span so a clause never becomes a dictionary entry', () => {
		expect(dictionaryWordFor(issue({ text: 'teh quick' }))).toBeUndefined();
	});
});

describe('withoutIgnoredWords', () => {
	it('drops an issue whose word the writer has taught the dictionary', () => {
		expect(withoutIgnoredWords([issue()], new Set(['nweke']))).toHaveLength(0);
	});

	it('keeps a spelling issue the dictionary has not answered', () => {
		expect(withoutIgnoredWords([issue()], new Set(['other']))).toHaveLength(1);
	});

	it('keeps a grammar issue even when its text is in the dictionary', () => {
		const grammar = issue({ kind: 'Grammar', text: 'Nweke' });
		expect(withoutIgnoredWords([grammar], new Set(['nweke']))).toHaveLength(1);
	});

	it('returns the original list untouched when nothing is ignored', () => {
		const issues = [issue()];
		expect(withoutIgnoredWords(issues, new Set())).toBe(issues);
	});
});

describe('proofreadSuggestion', () => {
	it('replaces the span outright for a replacement', () => {
		expect(proofreadSuggestion('replace', 'receive', 'recieve').replacement).toBe('receive');
	});

	it('keeps the problem text when the fix is an insertion after it', () => {
		expect(proofreadSuggestion('insertAfter', ',', 'However').replacement).toBe('However,');
	});

	it('empties the span for a removal', () => {
		expect(proofreadSuggestion('remove', 'the', 'the').replacement).toBe('');
	});

	it('labels a removal rather than showing an empty menu row', () => {
		expect(proofreadSuggestion('remove', 'the', 'the').label).toBe('Remove');
	});

	it('labels a whitespace-only replacement as a removal for the same reason', () => {
		expect(proofreadSuggestion('replace', ' ', 'the ').label).toBe('Remove');
	});
});
