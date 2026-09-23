import { describe, expect, it } from 'vitest';
import { importedNotesFixture } from '$lib/testing/notes/fixtures/import';
import { collectNoteLinkTargets } from '$lib/services/notes/references';

describe('imported note identities and write consequences', () => {
	it('stores each note body and indexes the saved note', async () => {
		const { run, records, consequences } = importedNotesFixture();
		await run({ 'one.md': '# One\n\nThe body.', 'two.md': 'Second body' });
		expect(
			records.notes.map((note) => ({
				title: note.title,
				text: note.plainText,
				indexed: consequences.indexedNoteIds.includes(note.id)
			}))
		).toEqual([
			{ title: 'one', text: 'One\n\nThe body.', indexed: true },
			{ title: 'two', text: 'Second body', indexed: true }
		]);
	});
	it('keeps an empty file as a blank note without an extra revision', async () => {
		const { run, records } = importedNotesFixture();
		await run({ 'empty.md': '   ' });
		expect(
			records.notes.map((note) => ({ text: note.plainText, revision: note.currentRevision }))
		).toEqual([{ text: '', revision: 1 }]);
	});
	it('creates one nested folder path shared by sibling notes', async () => {
		const { run, records } = importedNotesFixture();
		await run({ 'a/b/one.md': 'One', 'a/b/two.md': 'Two' });
		const a = records.notes.find((note) => note.title === 'a')!;
		const b = records.notes.find((note) => note.title === 'b')!;
		expect(records.notes.map((note) => [note.title, note.parentId])).toEqual([
			['a', undefined],
			['b', a.id],
			['one', b.id],
			['two', b.id]
		]);
	});
	it('resolves qualified forward links to different same-named notes', async () => {
		const { run, records } = importedNotesFixture();
		await run({
			'aaa.md': '[[a/report]] and [[b/report.md|other report]]',
			'a/report.md': 'First report',
			'b/report.md': 'Second report'
		});
		const index = records.notes.find((note) => note.title === 'aaa')!;
		const targets = records.notes.filter((note) => note.title === 'report');
		expect(collectNoteLinkTargets(index.document)).toEqual(targets.map((note) => note.id));
	});
	it('leaves an ambiguous bare link visible and reports it', async () => {
		const { run, records } = importedNotesFixture();
		const report = await run({
			'index.md': 'See [[report]]',
			'a/report.md': 'First',
			'b/report.md': 'Second'
		});
		const index = records.notes.find((note) => note.title === 'index')!;
		expect({ text: index.plainText, issues: report.unresolvedLinks }).toEqual({
			text: 'See [[report]]',
			issues: [{ path: 'index.md', target: 'report', reason: 'ambiguous' }]
		});
	});
	it('records backlinks for a resolved unique-title link', async () => {
		const { run, records, consequences } = importedNotesFixture();
		await run({ 'aaa.md': '[[zzz]]', 'zzz.md': 'Target' });
		const source = records.notes.find((note) => note.title === 'aaa')!;
		const target = records.notes.find((note) => note.title === 'zzz')!;
		expect(consequences.noteLinkTargets.get(source.id)).toEqual([target.id]);
	});
	it('keeps importing independent files after note creation fails', async () => {
		const { run, records } = importedNotesFixture();
		records.insertFailures.add('broken');
		const result = await run({ 'broken.md': 'Broken', 'good.md': 'Good' });
		expect({
			titles: records.notes.map((note) => note.title),
			imported: result.importedNoteIds.length,
			failed: result.failed.map((entry) => entry.path)
		}).toEqual({ titles: ['good'], imported: 1, failed: ['broken.md'] });
	});
	it('retains a blank shell and names a failed body while independent bodies save', async () => {
		const { run, records } = importedNotesFixture();
		records.saveFailures.add('broken');
		const result = await run({ 'broken.md': 'Broken', 'good.md': 'Good' });
		expect({
			notes: records.notes.map((note) => [note.title, note.plainText]),
			failed: result.failed.map((entry) => entry.path)
		}).toEqual({
			notes: [
				['broken', ''],
				['good', 'Good']
			],
			failed: ['broken.md']
		});
	});
	it('reports a failed parent folder and its blocked descendants while keeping independent branches', async () => {
		const { run, records } = importedNotesFixture();
		records.insertFailures.add('broken');
		const result = await run({
			'broken/a.md': 'A',
			'broken/child/b.md': 'B',
			'good/c.md': 'C',
			'root.md': 'Root'
		});
		expect({
			titles: records.notes.map((note) => note.title).sort(),
			failed: result.failed.map((entry) => entry.path).sort()
		}).toEqual({
			titles: ['c', 'good', 'root'],
			failed: ['broken', 'broken/a.md', 'broken/child', 'broken/child/b.md']
		});
	});
	it('does not resolve a duplicate bare title merely because one folder failed', async () => {
		const { run, records } = importedNotesFixture();
		records.insertFailures.add('broken');
		const result = await run({
			'broken/report.md': 'A',
			'good/report.md': 'B',
			'index.md': '[[report]]'
		});
		expect(result.unresolvedLinks).toEqual([
			{ path: 'index.md', target: 'report', reason: 'ambiguous' }
		]);
	});
	it('names a specifically referenced file that could not be created', async () => {
		const { run, records } = importedNotesFixture();
		records.insertFailures.add('missing');
		const result = await run({ 'folder/missing.md': 'A', 'index.md': '[[folder/missing]]' });
		expect(result.unresolvedLinks).toEqual([
			{ path: 'index.md', target: 'folder/missing', reason: 'unavailable' }
		]);
	});
	it('keeps same-named notes in separate folders and suffixes collisions within one folder', async () => {
		const { run, records } = importedNotesFixture();
		await run({ 'a/report.md': 'A', 'a/report.markdown': 'B', 'b/report.md': 'C' });
		expect(
			records.notes
				.filter((note) => note.kind === 'note')
				.map((note) => note.title)
				.sort()
		).toEqual(['report', 'report', 'report (2)']);
	});
	it('reports skipped files and discarded frontmatter keys', async () => {
		const { run } = importedNotesFixture();
		const result = await run({
			'one.md': '---\ntitle: One\ntags: [a]\n---\nBody',
			'image.png': 'bytes'
		});
		expect({
			skipped: result.skipped.map((entry) => entry.path),
			keys: result.unmappedFrontmatterKeys
		}).toEqual({ skipped: ['image.png'], keys: ['tags', 'title'] });
	});
});
