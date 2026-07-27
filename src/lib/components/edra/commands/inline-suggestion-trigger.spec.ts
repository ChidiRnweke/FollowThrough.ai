import { describe, it, expect } from 'vitest';
import { joinedSuggestion, shouldTrigger, type CaretContext } from './inline-suggestion-trigger';

const caret = (overrides: Partial<CaretContext> = {}): CaretContext => ({
	emptySelection: true,
	parentNames: ['paragraph'],
	markNames: [],
	documentLength: 200,
	characterBefore: ' ',
	characterAfter: '',
	meaningfulPrefixLength: 200,
	suppressed: false,
	...overrides
});

describe('shouldTrigger', () => {
	it('suggests at a resting caret in prose', () => {
		expect(shouldTrigger(caret())).toBe(true);
	});

	it('stays silent while a suggestion is suppressed', () => {
		expect(shouldTrigger(caret({ suppressed: true }))).toBe(false);
	});

	it('stays silent while text is selected', () => {
		expect(shouldTrigger(caret({ emptySelection: false }))).toBe(false);
	});

	it('stays silent in a note too short to continue', () => {
		expect(shouldTrigger(caret({ documentLength: 11 }))).toBe(false);
	});

	it('suggests early in a new note once there is a meaningful phrase', () => {
		expect(shouldTrigger(caret({ documentLength: 18, meaningfulPrefixLength: 18 }))).toBe(true);
	});

	it('stays silent inside a code block', () => {
		expect(shouldTrigger(caret({ parentNames: ['codeBlock'] }))).toBe(false);
	});

	it('stays silent inside a mermaid diagram', () => {
		expect(shouldTrigger(caret({ parentNames: ['mermaid'] }))).toBe(false);
	});

	it('stays silent inside a table cell nested in a paragraph', () => {
		expect(shouldTrigger(caret({ parentNames: ['paragraph', 'tableCell', 'table'] }))).toBe(false);
	});

	it('stays silent at the start of an empty block', () => {
		expect(shouldTrigger(caret({ characterBefore: '' }))).toBe(false);
	});

	it('stays silent mid-word', () => {
		expect(shouldTrigger(caret({ characterBefore: 'r', characterAfter: 'd' }))).toBe(false);
	});

	it('suggests mid-paragraph when the caret sits at a word boundary', () => {
		expect(shouldTrigger(caret({ characterBefore: 'd', characterAfter: ' ' }))).toBe(true);
	});

	it('suggests at the end of a word at the end of the text', () => {
		expect(shouldTrigger(caret({ characterBefore: 'd', characterAfter: '' }))).toBe(true);
	});
});

describe('Joining an accepted suggestion to the text before it', () => {
	it('adds the missing space between two words', () => {
		expect(joinedSuggestion('d', 'and then')).toBe(' and then');
	});

	it('leaves a suggestion that brings its own space alone', () => {
		expect(joinedSuggestion('d', ' and then')).toBe(' and then');
	});

	it('does not add a space after whitespace', () => {
		expect(joinedSuggestion(' ', 'and then')).toBe('and then');
	});

	it('does not add a space after an opening quote', () => {
		expect(joinedSuggestion('"', 'quoted')).toBe('quoted');
	});

	/** Otherwise the accepted text would read "the cache ." */
	it('does not push punctuation away from the word it follows', () => {
		expect(joinedSuggestion('e', ', which caches')).toBe(', which caches');
	});

	it('adds a space before a number continuing a word', () => {
		expect(joinedSuggestion('e', '2024 figures')).toBe(' 2024 figures');
	});

	it('leaves an empty suggestion empty', () => {
		expect(joinedSuggestion('d', '')).toBe('');
	});
});
