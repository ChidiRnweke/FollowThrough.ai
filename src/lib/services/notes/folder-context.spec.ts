import { describe, expect, it } from 'vitest';
import { folderNoteIds, resolveFolderContext } from './folder-context';
import { noteBuilder, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const folder = noteBuilder({ kind: 'folder', title: 'Research' });
const nested = noteBuilder({ id: testNoteId(2), kind: 'folder', parentId: folder.id });
const first = noteBuilder({ id: testNoteId(3), parentId: folder.id });
const second = noteBuilder({ id: testNoteId(4), parentId: nested.id });
const archived = noteBuilder({ id: testNoteId(5), parentId: folder.id, archivedAt: testNow });
const outside = noteBuilder({ id: testNoteId(6) });
const tree = [folder, nested, first, second, archived, outside];

describe('complete folder context', () => {
	it('includes live notes at every depth and excludes archived or unrelated notes', () => {
		expect(folderNoteIds(tree, folder.id)).toEqual([first.id, second.id]);
	});
	it('includes every note when a folder exceeds the former 25-note cap', () => {
		const notes = Array.from({ length: 80 }, (_, index) =>
			noteBuilder({ id: testNoteId(100 + index), parentId: folder.id })
		);
		expect(resolveFolderContext([folder, ...notes], [folder.id], 'complete')).toEqual({
			kind: 'ready',
			noteIds: notes.map((note) => note.id)
		});
	});
	it('refuses to resolve a partially downloaded inventory', () => {
		expect(resolveFolderContext([folder, first], [folder.id], 'unknown')).toEqual({
			kind: 'incomplete'
		});
	});
	it('distinguishes an unavailable folder from an empty folder', () => {
		expect(resolveFolderContext([first], [folder.id], 'complete')).toEqual({
			kind: 'missing',
			folderId: folder.id
		});
	});
	it('allows a known empty folder', () => {
		expect(resolveFolderContext([folder], [folder.id], 'complete')).toEqual({
			kind: 'ready',
			noteIds: []
		});
	});
	it('includes overlapping folder selections once', () => {
		expect(resolveFolderContext(tree, [folder.id, nested.id], 'complete')).toEqual({
			kind: 'ready',
			noteIds: [first.id, second.id]
		});
	});
	it('rejects an archived folder as unavailable context', () => {
		expect(
			resolveFolderContext([{ ...folder, archivedAt: testNow }], [folder.id], 'complete')
		).toEqual({ kind: 'missing', folderId: folder.id });
	});
	it('keeps duplicate-title folders distinct by their identities', () => {
		const other = { ...nested, title: folder.title, parentId: undefined };
		expect(resolveFolderContext([folder, other, first, second], [other.id], 'complete')).toEqual({
			kind: 'ready',
			noteIds: [second.id]
		});
	});
});
