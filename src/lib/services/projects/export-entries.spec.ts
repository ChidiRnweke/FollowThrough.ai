import { describe, expect, it } from 'vitest';
import type { ExportTreeNode } from '$lib/models/projects';
import { ProjectTreePresentationService } from './presentation';

const note = (title: string, kind = 'note'): ExportTreeNode => ({
	entry: { id: title.toLowerCase(), title, kind },
	children: []
});

const folder = (title: string, children: readonly ExportTreeNode[]): ExportTreeNode => ({
	entry: { id: title.toLowerCase(), title, kind: 'folder' },
	children
});

describe('Project export entry invariants', () => {
	it('offers every note in the tree', () => {
		const entries = new ProjectTreePresentationService().exportEntries([
			note('Kickoff'),
			folder('Interviews', [note('Round one')])
		]);
		expect(entries.map((entry) => entry.title)).toEqual(['Kickoff', 'Round one']);
	});

	it('leaves a root note at the top of the archive', () => {
		const entries = new ProjectTreePresentationService().exportEntries([note('Kickoff')]);
		expect(entries[0]?.path).toBe('Kickoff');
	});

	it('files a note under the folder holding it', () => {
		const entries = new ProjectTreePresentationService().exportEntries([
			folder('Interviews', [note('Round one')])
		]);
		expect({ path: entries[0]?.path, ids: entries.map((entry) => entry.id) }).toEqual({
			path: 'Interviews/Round one',
			ids: ['round one']
		});
	});

	it('composes the path through nested folders', () => {
		const entries = new ProjectTreePresentationService().exportEntries([
			folder('Interviews', [folder('Round two', [note('Findings')])])
		]);
		expect({ path: entries[0]?.path, depth: entries[0]?.depth }).toEqual({
			path: 'Interviews/Round two/Findings',
			depth: 2
		});
	});

	it('yields nothing for a folder with no notes in it', () => {
		expect(new ProjectTreePresentationService().exportEntries([folder('Empty', [])])).toEqual([]);
	});

	it('offers a skill alongside the notes, because it is a document too', () => {
		const entries = new ProjectTreePresentationService().exportEntries([note('Reviewer', 'skill')]);
		expect(entries.map((entry) => entry.title)).toEqual(['Reviewer']);
	});

	it('yields nothing for an empty project', () => {
		expect(new ProjectTreePresentationService().exportEntries([])).toEqual([]);
	});
});
