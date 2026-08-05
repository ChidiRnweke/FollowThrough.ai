import { describe, expect, it } from 'vitest';
import type { ExportTreeNode } from './export-entries';
import { projectExportEntries } from './export-entries';

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
		const entries = projectExportEntries([note('Kickoff'), folder('Interviews', [note('Round one')])]);
		expect(entries.map((entry) => entry.title)).toEqual(['Kickoff', 'Round one']);
	});

	it('leaves a root note at the top of the archive', () => {
		const entries = projectExportEntries([note('Kickoff')]);
		expect(entries[0]?.path).toBe('Kickoff');
	});

	it('files a note under the folder holding it', () => {
		const entries = projectExportEntries([folder('Interviews', [note('Round one')])]);
		expect(entries[0]?.path).toBe('Interviews/Round one');
	});

	it('composes the path through nested folders', () => {
		const entries = projectExportEntries([
			folder('Interviews', [folder('Round two', [note('Findings')])])
		]);
		expect(entries[0]?.path).toBe('Interviews/Round two/Findings');
	});

	it('counts the folders a note sits under as its depth', () => {
		const entries = projectExportEntries([
			folder('Interviews', [folder('Round two', [note('Findings')])])
		]);
		expect(entries[0]?.depth).toBe(2);
	});

	it('never offers a folder as a document of its own', () => {
		const entries = projectExportEntries([folder('Interviews', [note('Round one')])]);
		expect(entries.map((entry) => entry.id)).toEqual(['round one']);
	});

	it('yields nothing for a folder with no notes in it', () => {
		expect(projectExportEntries([folder('Empty', [])])).toEqual([]);
	});

	it('offers a skill alongside the notes, because it is a document too', () => {
		const entries = projectExportEntries([note('Reviewer', 'skill')]);
		expect(entries.map((entry) => entry.title)).toEqual(['Reviewer']);
	});

	it('yields nothing for an empty project', () => {
		expect(projectExportEntries([])).toEqual([]);
	});
});
