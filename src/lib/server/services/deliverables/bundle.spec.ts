import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { packZip } from './bundle';

const file = (path: string, body = 'x') => ({ path, bytes: Buffer.from(body) });

/** Sorted, because a zip's central directory carries no promise about entry order. */
const entryNames = (archive: Buffer): string[] =>
	new AdmZip(archive)
		.getEntries()
		.map((entry) => entry.entryName)
		.sort();

describe('Bundle packing invariants', () => {
	it('writes one entry per file and preserves each file path and body', () => {
		const archive = packZip([
			file('One.pdf', 'one body'),
			file('Interviews/Round two/Notes.pdf', 'nested body'),
			file('Two.pdf', 'two body')
		]);
		const zip = new AdmZip(archive);
		expect({
			rootBytes: zip.getEntry('One.pdf')?.getData().toString(),
			nestedBytes: zip.getEntry('Interviews/Round two/Notes.pdf')?.getData().toString(),
			paths: entryNames(archive)
		}).toEqual({
			rootBytes: 'one body',
			nestedBytes: 'nested body',
			paths: ['Interviews/Round two/Notes.pdf', 'One.pdf', 'Two.pdf']
		});
	});

	it('drops traversal segments from a path', () => {
		const archive = packZip([file('../../etc/passwd.pdf')]);
		expect(entryNames(archive)).toEqual(['etc/passwd.pdf']);
	});

	it('strips the characters a file name cannot carry', () => {
		const archive = packZip([file('Q3: plan | draft?.pdf')]);
		expect(entryNames(archive)).toEqual(['Q3 plan  draft.pdf']);
	});

	it('never lets a leading dot make a file hidden', () => {
		const archive = packZip([file('.env.pdf')]);
		expect(entryNames(archive)).toEqual(['env.pdf']);
	});

	it('names an unusable path so the file still lands', () => {
		const archive = packZip([file('..')]);
		expect(entryNames(archive)).toEqual(['document']);
	});

	it('keeps both files when two notes share a name', () => {
		const archive = packZip([file('Notes.pdf'), file('Notes.pdf'), file('Notes.pdf')]);
		expect(entryNames(archive)).toEqual(['Notes (2).pdf', 'Notes (3).pdf', 'Notes.pdf']);
	});

	it('suffixes a collision before the extension, not after it', () => {
		const archive = packZip([file('Notes.docx'), file('Notes.docx')]);
		expect(entryNames(archive)).toContain('Notes (2).docx');
	});

	it('packs an empty selection into an empty archive', () => {
		expect(entryNames(packZip([]))).toEqual([]);
	});
});
