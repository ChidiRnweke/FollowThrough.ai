import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { Note, ProseMirrorDocument } from '$lib/models/notes';

const setup = () => {
	const content = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteReader: content,
			noteTextSearcher: content,
			noteEditor: content,
			noteLinkReconciler: content,
			anchorRepairer: content,
			noteIndexer: content,
			transactionRunner: new InMemoryTransactionRunner([content])
		})
	);
	return { content, controller };
};

const textDocument = (text: string): ProseMirrorDocument => ({
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

const noteWithText = (text: string, overrides: Partial<Note> = {}): Note =>
	noteBuilder({ plainText: text, document: textDocument(text), ...overrides });

const search = { query: 'ship', regex: false, caseSensitive: false };

describe('Searching note text', () => {
	it('finds content matches with their offsets', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('ship it, then ship it again')];
		const result = await controller.searchText(testActor(), search);
		expect(result.hits[0]?.matches).toMatchObject([
			{ start: 0, end: 4, text: 'ship' },
			{ start: 14, end: 18, text: 'ship' }
		]);
	});

	it('attaches a display snippet to each content match', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('ship it, then ship it again')];
		const result = await controller.searchText(testActor(), search);
		expect(result.hits[0]?.matches[0]?.snippet).toEqual({
			before: '',
			hit: 'ship',
			after: ' it, then ship it again'
		});
	});

	it('finds title matches alongside content matches', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('nothing here', { title: 'Ship log' })];
		const result = await controller.searchText(testActor(), search);
		expect(result.hits[0]?.titleMatches).toEqual([{ start: 0, end: 4, text: 'Ship' }]);
	});

	it('scopes the search to one project when asked', async () => {
		const { content, controller } = setup();
		content.notes = [
			noteWithText('ship alpha'),
			noteWithText('ship beta', { id: testNoteId(2), projectId: testProjectId(2) })
		];
		const result = await controller.searchText(testActor(), {
			...search,
			projectId: testProjectId(2)
		});
		expect(result.hits.map((hit) => hit.noteId)).toEqual([testNoteId(2)]);
	});

	it('excludes archived notes', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('ship it', { archivedAt: testNow })];
		const result = await controller.searchText(testActor(), search);
		expect(result.hits).toEqual([]);
	});

	it('rejects an invalid regex before reading anything', async () => {
		const { controller } = setup();
		await expect(
			controller.searchText(testActor(), { query: '([', regex: true, caseSensitive: false })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects an empty query', async () => {
		const { controller } = setup();
		await expect(
			controller.searchText(testActor(), { query: '', regex: false, caseSensitive: false })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});

describe('Replacing note text', () => {
	const replace = { ...search, replacement: 'ship' };

	it('rewrites the body of every matching note', async () => {
		const { content, controller } = setup();
		content.notes = [
			noteWithText('deploy alpha'),
			noteWithText('deploy beta', { id: testNoteId(2) })
		];
		await controller.replaceText(testActor(), { ...replace, query: 'deploy' });
		expect(content.notes.map((note) => note.plainText)).toEqual(['ship alpha', 'ship beta']);
	});

	it('reports how many notes and matches it replaced', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('deploy and deploy')];
		const result = await controller.replaceText(testActor(), { ...replace, query: 'deploy' });
		expect(result).toEqual({ replacedNotes: 1, replacedMatches: 2 });
	});

	it('restricts the replacement to the given notes', async () => {
		const { content, controller } = setup();
		content.notes = [
			noteWithText('deploy alpha'),
			noteWithText('deploy beta', { id: testNoteId(2) })
		];
		await controller.replaceText(testActor(), {
			...replace,
			query: 'deploy',
			noteIds: [testNoteId(2)]
		});
		expect(content.notes.map((note) => note.plainText)).toEqual(['deploy alpha', 'ship beta']);
	});

	it('leaves notes whose only match is the title untouched', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('nothing here', { title: 'Ship log' })];
		const result = await controller.replaceText(testActor(), replace);
		expect(result).toEqual({ replacedNotes: 0, replacedMatches: 0 });
	});

	it('saves through the regular path so the note is re-indexed', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('deploy alpha')];
		await controller.replaceText(testActor(), { ...replace, query: 'deploy' });
		expect(content.indexedNoteIds).toEqual([testNoteId()]);
	});

	it('rejects an invalid regex before changing anything', async () => {
		const { content, controller } = setup();
		content.notes = [noteWithText('deploy alpha')];
		await expect(
			controller.replaceText(testActor(), {
				query: '([',
				regex: true,
				caseSensitive: false,
				replacement: 'x'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});
