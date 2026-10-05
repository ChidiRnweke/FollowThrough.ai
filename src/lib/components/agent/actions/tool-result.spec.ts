import { describe, expect, it } from 'vitest';
import { summariseToolResult } from './tool-result';

describe('A result the reader can use', () => {
	it('says nothing at all when a tool returned nothing', () => {
		expect(summariseToolResult(undefined).empty).toBe(true);
	});

	it('says nothing at all when a tool returned an unreadable record', () => {
		expect(summariseToolResult({ noteId: '9e8e1812-0a7c-474d-96e4-65c5b60b3f75' }).empty).toBe(
			true
		);
	});

	it('reads a short string back as the result', () => {
		expect(summariseToolResult('Saved.').lines).toEqual(['Saved.']);
	});

	it('treats a long string as prose rather than a line', () => {
		expect(summariseToolResult('word '.repeat(40))).toEqual({
			lines: [],
			prose: 'word '.repeat(40).trim(),
			empty: false
		});
	});
});

describe('Collections are counted before they are listed', () => {
	const notes = [
		{ id: 'a', title: 'Runtime notes' },
		{ id: 'b', title: 'Meeting notes' }
	];

	it('counts the collection and names each item', () => {
		const result = summariseToolResult(notes);
		expect({ headline: result.headline, lines: result.lines }).toEqual({
			headline: '2 results',
			lines: ['Runtime notes', 'Meeting notes']
		});
	});

	it('states an empty search plainly instead of hiding it', () => {
		expect(summariseToolResult([]).headline).toBe('Nothing found');
	});

	it('caps the list and reports the remainder', () => {
		const many = Array.from({ length: 9 }, (_, index) => ({ title: `Note ${index}` }));
		expect(summariseToolResult(many).more).toBe(4);
	});

	it('finds a collection wrapped in a record', () => {
		expect(summariseToolResult({ notes }).headline).toBe('2 results');
	});
});

describe('A recoverable failure is the headline', () => {
	const output = {
		failure: 'No tool named "save_notes".',
		recovery: 'Call search_tools to discover the capability.'
	};

	it('leads with what went wrong and keeps the recovery step', () => {
		const result = summariseToolResult(output);
		expect({ headline: result.headline, lines: result.lines }).toEqual({
			headline: 'No tool named "save_notes".',
			lines: ['Call search_tools to discover the capability.']
		});
	});
});

describe('Transport bookkeeping is not a result', () => {
	it('drops the etag a note read comes back with', () => {
		expect(
			summariseToolResult({ title: 'Runtime notes', etag: 'note:99691b75:r14' }).lines
		).toEqual(['Title: Runtime notes']);
	});

	it('counts the tool results without listing their internal names', () => {
		const result = summariseToolResult(
			[{ name: 'create_note' }, { name: 'save_note' }],
			'search_tools'
		);
		expect({ headline: result.headline, lines: result.lines }).toEqual({
			headline: 'Found 2 tools it can use',
			lines: []
		});
	});
});

describe('Records read as labelled fields', () => {
	it('keeps identifiers out of the fields a person reads', () => {
		expect(
			summariseToolResult({ title: 'Runtime', projectId: 'e0d3f07c-460b-40c3-9b8c-a8dc00ddc565' })
				.lines
		).toEqual(['Title: Runtime']);
	});
});
