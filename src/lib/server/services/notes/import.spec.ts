import { describe, expect, it } from 'vitest';
import {
	uniqueTitleIn,
	resolveArchiveLinks as resolveIndexedArchiveLinks,
	indexArchiveReferences
} from './import';
import type { ArchiveNoteReference, ParsedMarkdownNote } from '$lib/models/projects';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const resolveArchiveLinks = (
	source: ParsedMarkdownNote,
	references: readonly ArchiveNoteReference[]
) => resolveIndexedArchiveLinks(source, indexArchiveReferences(references));

const reference: ArchiveNoteReference = {
	path: 'reviews/Design Review.md',
	title: 'Design Review',
	outcome: { kind: 'created', id: testNoteId() }
};
const note = (markdown: string): ParsedMarkdownNote => ({
	path: 'index.md',
	folders: [],
	title: 'index',
	markdown,
	frontmatterKeys: []
});

describe('archive link identity', () => {
	it('resolves a path even when its frontmatter title resembles an escaping path', () => {
		expect(
			resolveArchiveLinks(note('[[reviews/Design Review]]'), [
				{ ...reference, title: '../Decisions' }
			]).markdown
		).toBe(`[reviews/Design Review](note:${testNoteId()})`);
	});
	it('resolves a unique title without depending on case', () => {
		expect(resolveArchiveLinks(note('See [[design review]]'), [reference]).markdown).toBe(
			`See [design review](note:${testNoteId()})`
		);
	});
	it('keeps the shown label of a piped link', () => {
		expect(resolveArchiveLinks(note('[[Design Review|the review]]'), [reference]).markdown).toBe(
			`[the review](note:${testNoteId()})`
		);
	});
	it('leaves an unresolved link as written', () => {
		expect(resolveArchiveLinks(note('See [[Missing Note]]'), [reference]).markdown).toBe(
			'See [[Missing Note]]'
		);
	});
	it('leaves ordinary prose unchanged', () => {
		expect(resolveArchiveLinks(note('an array[[0]] index'), [reference]).markdown).toBe(
			'an array[[0]] index'
		);
	});
	it('resolves every occurrence of a unique link', () => {
		expect(
			resolveArchiveLinks(note('[[Design Review]] and [[Design Review]]'), [reference]).markdown
		).toBe(`[Design Review](note:${testNoteId()}) and [Design Review](note:${testNoteId()})`);
	});
	it('normalizes a qualified path and optional Markdown extension', () => {
		expect(resolveArchiveLinks(note('[[/reviews/./Design Review.md]]'), [reference]).markdown).toBe(
			`[/reviews/./Design Review.md](note:${testNoteId()})`
		);
	});
	it('resolves an explicitly relative path from the source folder', () => {
		const source = {
			...note('[[../reviews/Design Review]]'),
			folders: ['plans'],
			path: 'plans/index.md'
		};
		expect(resolveArchiveLinks(source, [reference]).markdown).toBe(
			`[../reviews/Design Review](note:${testNoteId()})`
		);
	});
	it('refuses a relative path that escapes the archive', () => {
		expect(resolveArchiveLinks(note('[[../reviews/Design Review]]'), [reference]).issues).toEqual([
			{ path: 'index.md', target: '../reviews/Design Review', reason: 'missing' }
		]);
	});
	it('reports a heading reference it cannot preserve as a note link', () => {
		expect(resolveArchiveLinks(note('[[Design Review#Decision]]'), [reference]).issues).toEqual([
			{ path: 'index.md', target: 'Design Review#Decision', reason: 'unsupported' }
		]);
	});
	it('does not select between two entries with the same normalized path', () => {
		const other: ArchiveNoteReference = {
			...reference,
			path: 'reviews/design review.MD',
			outcome: { kind: 'created', id: testNoteId(2) }
		};
		expect(
			resolveArchiveLinks(note('[[reviews/Design Review]]'), [reference, other]).issues
		).toEqual([{ path: 'index.md', target: 'reviews/Design Review', reason: 'ambiguous' }]);
	});
});

describe('Keeping imported titles distinct', () => {
	it('leaves the first use of a title alone', () => {
		expect(uniqueTitleIn(new Set(), 'Notes')).toBe('Notes');
	});

	it('suffixes a repeated title rather than overwriting', () => {
		const taken = new Set(['Notes']);
		expect(uniqueTitleIn(taken, 'Notes')).toBe('Notes (2)');
	});

	it('keeps counting past the second collision', () => {
		const taken = new Set(['Notes', 'Notes (2)']);
		expect(uniqueTitleIn(taken, 'Notes')).toBe('Notes (3)');
	});
});
