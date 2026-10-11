import { NoteTextSearchService } from './text-search';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
const search = new NoteTextSearchService();
import { describe, expect, it } from 'vitest';
import {
	proseMirrorDocumentSchema,
	type NoteSearchOptions,
	type ProseMirrorDocument,
	type ProseMirrorNode,
	type ProseMirrorParagraphNode,
	type ProseMirrorTextNode
} from '$lib/models/notes';

const literal: NoteSearchOptions = { regex: false, caseSensitive: false };

const doc = (...blocks: ProseMirrorNode[]): ProseMirrorDocument => ({
	type: 'doc',
	content: blocks
});

const paragraph = (...texts: (string | ProseMirrorNode)[]): ProseMirrorParagraphNode => ({
	type: 'paragraph',
	content: texts.map((text) => (typeof text === 'string' ? { type: 'text', text } : text))
});

const bold = (text: string): ProseMirrorTextNode => ({
	type: 'text',
	text,
	marks: [{ type: 'bold' }]
});

const searchNoteText = (text: string, query: string, options: NoteSearchOptions) =>
	search
		.search([noteBuilder({ title: 'Target', plainText: text })], query, options)
		.flatMap((hit) => hit.matches.map(({ start, end, text }) => ({ start, end, text })));
const snippet = (text: string, query: string) =>
	search.search([noteBuilder({ title: 'Target', plainText: text })], query, literal)[0]?.matches[0]
		?.snippet;
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

	it('shows every match that replacement will change beyond the former hundred-match limit', () => {
		expect(searchNoteText('a '.repeat(150), 'a', literal)).toHaveLength(150);
	});
});

describe('Search result snippets', () => {
	it('windows a match with sixty characters on both sides', () => {
		expect(snippet('a'.repeat(100) + 'target' + 'b'.repeat(100), 'target')).toEqual({
			before: 'a'.repeat(60),
			hit: 'target',
			after: 'b'.repeat(60),
			truncatedBefore: true,
			truncatedAfter: true
		});
	});
	it('moves unused leading context to the trailing window', () => {
		expect(snippet('abtarget' + 'c'.repeat(150), 'target')).toEqual({
			before: 'ab',
			hit: 'target',
			after: 'c'.repeat(118),
			truncatedBefore: false,
			truncatedAfter: true
		});
	});
	it('moves unused trailing context to the leading window', () => {
		expect(snippet('a'.repeat(150) + 'targetbc', 'target')).toEqual({
			before: 'a'.repeat(118),
			hit: 'target',
			after: 'bc',
			truncatedBefore: true,
			truncatedAfter: false
		});
	});
	it('claims no truncation when the whole text fits', () => {
		expect(snippet('short note', 'short')).toEqual({
			before: '',
			hit: 'short',
			after: ' note',
			truncatedBefore: false,
			truncatedAfter: false
		});
	});
});
describe('Replacement capture expansion', () => {
	const replace = (replacement: string) =>
		search.replace(doc(paragraph('team@followthrough')), '(\\w+)@(\\w+)', replacement, {
			regex: true,
			caseSensitive: false
		})?.plainText;
	it('expands numbered captures', () => {
		expect(replace('$2.$1')).toBe('followthrough.team');
	});
	it('expands the full match and a literal dollar', () => {
		expect(replace('[$&]$$')).toBe('[team@followthrough]$');
	});
	it('expands missing groups to empty text', () => {
		expect(replace('<$9>')).toBe('<>');
	});
});
describe('Replacing in a document', () => {
	it('replaces text inside a single text node', () => {
		const result = search.replace(doc(paragraph('hello world')), 'world', 'there', literal);
		expect(result?.plainText).toBe('hello there');
	});

	it('replaces across paragraphs', () => {
		const result = search.replace(
			doc(paragraph('alpha'), paragraph('beta')),
			'alpha\n\nbeta',
			'merged',
			literal
		);
		expect(result?.plainText).toBe('merged');
	});

	it('drops a paragraph the replacement emptied', () => {
		const result = search.replace(doc(paragraph('gone'), paragraph('stays')), 'gone', '', literal);
		expect(result?.document.content).toEqual([paragraph('stays')]);
	});

	it('keeps the first node marks when a match spans an inline boundary', () => {
		const result = search.replace(doc(paragraph('foo', bold('bar'))), 'foobar', 'baz', literal);
		expect(result?.document.content?.[0]).toMatchObject({
			content: [{ type: 'text', text: 'baz' }]
		});
	});

	it('removes the matched slice from later nodes without touching their siblings', () => {
		const result = search.replace(doc(paragraph('a', bold('Xb'))), 'aX', '', literal);
		expect(result?.document.content?.[0]).toMatchObject({ content: [bold('b')] });
	});

	it('expands regex capture groups per match', () => {
		const result = search.replace(doc(paragraph('one two')), '(\\w+) (\\w+)', '$2 $1', {
			regex: true,
			caseSensitive: true
		});
		expect(result?.plainText).toBe('two one');
	});

	it('replaces every occurrence in one pass', () => {
		const result = search.replace(doc(paragraph('a a a')), 'a', 'b', literal);
		expect(result).toMatchObject({ replaced: 3, plainText: 'b b b' });
	});

	it('leaves a valid document behind', () => {
		const result = search.replace(
			doc(paragraph('foo', bold('bar')), paragraph('tail')),
			'foobar\n\ntail',
			'x',
			literal
		);
		expect(proseMirrorDocumentSchema.safeParse(result?.document).error?.issues[0]).toBeUndefined();
	});

	it('never leaves the document without a block', () => {
		const result = search.replace(doc(paragraph('only')), 'only', '', literal);
		expect(result?.document.content).toEqual([{ type: 'paragraph' }]);
	});

	it('returns undefined when nothing matches', () => {
		expect(search.replace(doc(paragraph('abc')), 'zzz', 'x', literal)).toBeUndefined();
	});

	it('does not mutate the original document', () => {
		const original = doc(paragraph('hello world'));
		search.replace(original, 'world', 'there', literal);
		expect(original.content?.[0]).toMatchObject({
			content: [{ type: 'text', text: 'hello world' }]
		});
	});
});

describe('Deriving document text', () => {
	it('joins blocks with the editor block separator', () => {
		expect(
			search.replace(doc(paragraph('one'), paragraph('two')), 'two', 'two', literal)?.plainText
		).toBe('one\n\ntwo');
	});

	it('renders hard breaks as newlines', () => {
		const withBreak = paragraph('line', { type: 'hardBreak' }, 'next');
		expect(search.replace(doc(withBreak), 'next', 'next', literal)?.plainText).toBe('line\nnext');
	});
});
