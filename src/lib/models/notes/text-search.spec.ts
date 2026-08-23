import { describe, expect, it } from 'vitest';
import {
	expandNoteReplacement,
	findProseMirrorDocumentIssue,
	noteDocumentText,
	noteSearchSnippet,
	replaceInNoteDocument,
	searchNoteText,
	type NoteSearchOptions
} from './index';

const literal: NoteSearchOptions = { regex: false, caseSensitive: false };

const doc = (...blocks: Record<string, unknown>[]) => ({ type: 'doc' as const, content: blocks });

const paragraph = (...texts: (string | Record<string, unknown>)[]) => ({
	type: 'paragraph',
	content: texts.map((text) => (typeof text === 'string' ? { type: 'text', text } : text))
});

const bold = (text: string) => ({ type: 'text', text, marks: [{ type: 'bold' }] });

describe('Searching note text', () => {
	it('finds literal matches with exact offsets', () => {
		expect(searchNoteText('one fish two fish', 'fish', literal)).toEqual([
			{ start: 4, end: 8, text: 'fish' },
			{ start: 13, end: 17, text: 'fish' }
		]);
	});

	it('treats regex metacharacters literally when regex is off', () => {
		expect(searchNoteText('a.b aXb', 'a.b', literal)).toEqual([{ start: 0, end: 3, text: 'a.b' }]);
	});

	it('matches case-insensitively by default', () => {
		expect(searchNoteText('Fish fish FISH', 'fish', literal)).toHaveLength(3);
	});

	it('honours the case-sensitive toggle', () => {
		expect(searchNoteText('Fish fish FISH', 'fish', { regex: false, caseSensitive: true })).toEqual(
			[{ start: 5, end: 9, text: 'fish' }]
		);
	});

	it('matches with regex when enabled', () => {
		expect(searchNoteText('cat car cap', 'ca[rp]', { regex: true, caseSensitive: true })).toEqual([
			{ start: 4, end: 7, text: 'car' },
			{ start: 8, end: 11, text: 'cap' }
		]);
	});

	it('returns no matches for an invalid regex instead of throwing', () => {
		expect(searchNoteText('anything', '([', { regex: true, caseSensitive: false })).toEqual([]);
	});

	it('skips zero-length matches', () => {
		expect(searchNoteText('bbb', 'a*', { regex: true, caseSensitive: false })).toEqual([]);
	});

	it('caps the matches per note', () => {
		expect(searchNoteText('a a a a', 'a', literal, 2)).toHaveLength(2);
	});
});

describe('Shaping a snippet', () => {
	it('windows the match with context on both sides', () => {
		const text = '0123456789'.repeat(10);
		expect(noteSearchSnippet(text, { start: 50, end: 55, text: '' }, 5)).toEqual({
			before: '56789',
			hit: '01234',
			after: '56789',
			truncatedBefore: true,
			truncatedAfter: true
		});
	});

	it('moves the leading budget to trailing context for a match at the text start', () => {
		const text = '0123456789'.repeat(10);
		expect(noteSearchSnippet(text, { start: 2, end: 4, text: '' }, 5)).toEqual({
			before: '01',
			hit: '23',
			after: '45678901',
			truncatedBefore: false,
			truncatedAfter: true
		});
	});

	it('moves the trailing budget to leading context for a match at the text end', () => {
		const text = '0123456789'.repeat(10);
		expect(noteSearchSnippet(text, { start: 96, end: 98, text: '' }, 5)).toEqual({
			before: '89012345',
			hit: '67',
			after: '89',
			truncatedBefore: true,
			truncatedAfter: false
		});
	});

	it('claims no truncation when the whole text fits the window', () => {
		expect(noteSearchSnippet('short note', { start: 0, end: 5, text: '' }, 60)).toEqual({
			before: '',
			hit: 'short',
			after: ' note',
			truncatedBefore: false,
			truncatedAfter: false
		});
	});
});

describe('Expanding replacements', () => {
	const exec = /(\w+)@(\w+)/.exec('team@followthrough')!;
	it('expands numbered captures', () => {
		expect(expandNoteReplacement('$2.$1', exec)).toBe('followthrough.team');
	});
	it('expands $& to the whole match and $$ to a dollar', () => {
		expect(expandNoteReplacement('[$&]$$', exec)).toBe('[team@followthrough]$');
	});
	it('expands missing groups to the empty string', () => {
		expect(expandNoteReplacement('<$9>', exec)).toBe('<>');
	});
});

describe('Replacing in a document', () => {
	it('replaces text inside a single text node', () => {
		const result = replaceInNoteDocument(doc(paragraph('hello world')), 'world', 'there', literal);
		expect(result?.plainText).toBe('hello there');
	});

	it('replaces across paragraphs', () => {
		const result = replaceInNoteDocument(
			doc(paragraph('alpha'), paragraph('beta')),
			'alpha\n\nbeta',
			'merged',
			literal
		);
		expect(result?.plainText).toBe('merged');
	});

	it('drops a paragraph the replacement emptied', () => {
		const result = replaceInNoteDocument(
			doc(paragraph('gone'), paragraph('stays')),
			'gone',
			'',
			literal
		);
		expect(result?.document.content).toEqual([paragraph('stays')]);
	});

	it('keeps the first node marks when a match spans an inline boundary', () => {
		const result = replaceInNoteDocument(
			doc(paragraph('foo', bold('bar'))),
			'foobar',
			'baz',
			literal
		);
		expect(result?.document.content?.[0].content).toEqual([{ type: 'text', text: 'baz' }]);
	});

	it('removes the matched slice from later nodes without touching their siblings', () => {
		const result = replaceInNoteDocument(doc(paragraph('a', bold('Xb'))), 'aX', '', literal);
		expect(result?.document.content?.[0].content).toEqual([bold('b')]);
	});

	it('expands regex capture groups per match', () => {
		const result = replaceInNoteDocument(doc(paragraph('one two')), '(\\w+) (\\w+)', '$2 $1', {
			regex: true,
			caseSensitive: true
		});
		expect(result?.plainText).toBe('two one');
	});

	it('replaces every occurrence in one pass', () => {
		const result = replaceInNoteDocument(doc(paragraph('a a a')), 'a', 'b', literal);
		expect(result).toMatchObject({ replaced: 3, plainText: 'b b b' });
	});

	it('leaves a valid document behind', () => {
		const result = replaceInNoteDocument(
			doc(paragraph('foo', bold('bar')), paragraph('tail')),
			'foobar\n\ntail',
			'x',
			literal
		);
		expect(findProseMirrorDocumentIssue(result?.document)).toBeUndefined();
	});

	it('never leaves the document without a block', () => {
		const result = replaceInNoteDocument(doc(paragraph('only')), 'only', '', literal);
		expect(result?.document.content).toEqual([{ type: 'paragraph' }]);
	});

	it('returns undefined when nothing matches', () => {
		expect(replaceInNoteDocument(doc(paragraph('abc')), 'zzz', 'x', literal)).toBeUndefined();
	});

	it('does not mutate the original document', () => {
		const original = doc(paragraph('hello world'));
		replaceInNoteDocument(original, 'world', 'there', literal);
		expect(original.content?.[0].content).toEqual([{ type: 'text', text: 'hello world' }]);
	});
});

describe('Deriving document text', () => {
	it('joins blocks with the editor block separator', () => {
		expect(noteDocumentText(doc(paragraph('one'), paragraph('two')))).toBe('one\n\ntwo');
	});

	it('renders hard breaks as newlines', () => {
		const withBreak = paragraph('line', { type: 'hardBreak' }, 'next');
		expect(noteDocumentText(doc(withBreak))).toBe('line\nnext');
	});
});
