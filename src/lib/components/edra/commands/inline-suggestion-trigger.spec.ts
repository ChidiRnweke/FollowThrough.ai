import { describe, it, expect } from 'vitest';
import { shouldTrigger, type CaretContext } from './inline-suggestion-trigger';

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
		expect(shouldTrigger(caret({ documentLength: 12 }))).toBe(false);
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
