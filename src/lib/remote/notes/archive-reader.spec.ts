import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import {
	archiveEntryPath,
	DEFAULT_ARCHIVE_LIMITS,
	parseMarkdownNote,
	readMarkdownArchive,
	splitFrontmatter,
	type ArchiveEntry
} from './archive-reader.server';

/** Archives are built in memory, so the suite needs no fixture files. */
const zipOf = (files: Readonly<Record<string, string>>): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files))
		zip.addFile(path, Buffer.from(content, 'utf8'));
	return new Uint8Array(zip.toBuffer());
};

const read = (files: Readonly<Record<string, string>>, limits = DEFAULT_ARCHIVE_LIMITS) =>
	readMarkdownArchive(zipOf(files), limits);

const entry = (path: string, text: string): ArchiveEntry => ({
	path,
	segments: path.split('/'),
	text
});

describe('Reading a Markdown archive', () => {
	it('collects the Markdown files', () => {
		const outcome = read({ 'notes/one.md': '# One' });
		expect(outcome.ok && outcome.result.entries).toHaveLength(1);
	});

	it('reads Markdown extensions and preserves each file path in one archive', () => {
		const outcome = read({ 'a/b/one.md': '# One', 'two.markdown': '# Two' });
		if (!outcome.ok) throw new Error(`Archive rejected: ${outcome.rejection.reason}`);
		expect({
			paths: outcome.result.entries.map((file) => file.path),
			segments: outcome.result.entries.map((file) => file.segments)
		}).toEqual({
			paths: ['a/b/one.md', 'two.markdown'],
			segments: [['a', 'b', 'one.md'], ['two.markdown']]
		});
	});

	it('reports a non-Markdown file as skipped rather than dropping it silently', () => {
		const outcome = read({ 'notes/logo.png': 'binary' });
		expect(outcome.ok && outcome.result.skipped[0]?.reason).toBe('Not a Markdown file');
	});

	it('ignores macOS metadata entries', () => {
		const outcome = read({ '__MACOSX/one.md': '# One', 'one.md': '# One' });
		expect(outcome.ok && outcome.result.entries.map((entry) => entry.path)).toEqual(['one.md']);
	});

	it('ignores an editor’s dot-directory', () => {
		const outcome = read({ '.obsidian/config.md': 'x', 'one.md': '# One' });
		expect(outcome.ok && outcome.result.entries.map((e) => e.path)).toEqual(['one.md']);
	});
});

describe('Refusing a hostile archive', () => {
	it('rejects an archive that expands past the byte limit', () => {
		const outcome = read(
			{ 'big.md': 'x'.repeat(4096) },
			{ ...DEFAULT_ARCHIVE_LIMITS, maxTotalBytes: 1024 }
		);
		expect(outcome.ok === false && outcome.rejection.reason).toBe('too_large');
	});

	it('rejects an archive with too many files', () => {
		const files = Object.fromEntries(
			Array.from({ length: 5 }, (_unused, index) => [`note-${index}.md`, '# x'])
		);
		const outcome = read(files, { ...DEFAULT_ARCHIVE_LIMITS, maxEntries: 3 });
		expect(outcome.ok === false && outcome.rejection.reason).toBe('too_many_entries');
	});

	it('rejects something that is not a zip at all', () => {
		expect(readMarkdownArchive(new Uint8Array([1, 2, 3, 4])).ok).toBe(false);
	});

	it('imports individual notes larger than the former one MiB cap', () => {
		const outcome = read({ 'big.md': 'x'.repeat(1024 * 1024 + 1), 'small.md': '# ok' });
		expect(outcome.ok && outcome.result.entries.map((e) => e.path)).toEqual(['big.md', 'small.md']);
	});

	it('imports notes nested beyond eight folders', () => {
		const outcome = read({ 'a/b/c/d/e/f/g/h/i/one.md': '# One' });
		expect(outcome.ok && outcome.result.entries).toHaveLength(1);
	});
});

describe('Choosing a note’s title', () => {
	it('names the note after its file, made readable', () => {
		expect(parseMarkdownNote(entry('my_release-notes.md', 'Body only.')).title).toBe(
			'my release notes'
		);
	});

	/** The filename wins, while the document heading remains body content. */
	it('uses the filename instead of frontmatter and keeps a leading heading in the body', () => {
		const note = parseMarkdownNote(
			entry('some-file.md', '---\ntitle: From Frontmatter\n---\n# From Heading\n\nBody.')
		);
		expect({ title: note.title, markdown: note.markdown }).toEqual({
			title: 'some file',
			markdown: '# From Heading\n\nBody.'
		});
	});

	it('keeps a heading that is not the first block', () => {
		const note = parseMarkdownNote(entry('one.md', 'Intro.\n\n# Section\n\nBody.'));
		expect(note.markdown).toContain('# Section');
	});

	it('records the note’s folders', () => {
		expect(parseMarkdownNote(entry('a/b/one.md', '# One')).folders).toEqual(['a', 'b']);
	});
});

describe('Handling frontmatter', () => {
	it('strips frontmatter from the body rather than rendering it as prose', () => {
		expect(splitFrontmatter('---\ntags: [a]\n---\nBody.').body.trim()).toBe('Body.');

		expect(splitFrontmatter('---\ntags: [a]\nauthor: Ada\n---\nBody.').keys).toEqual([
			'tags',
			'author'
		]);
	});

	it('still strips a malformed block instead of showing raw YAML', () => {
		expect(splitFrontmatter('---\n: : :\n---\nBody.').body.trim()).toBe('Body.');
	});

	it('leaves a body with no frontmatter untouched', () => {
		expect(splitFrontmatter('Just prose.').body).toBe('Just prose.');
	});

	it('does not treat a thematic break as frontmatter', () => {
		expect(splitFrontmatter('Intro.\n\n---\n\nMore.').keys).toEqual([]);
	});
});

/**
 * The guard is tested directly rather than through a crafted archive: adm-zip's writer
 * strips traversal from a name as it packs it, so `addFile('../x.md')` produces a
 * harmless `x.md` and could never exercise this. Only its reader returns such names,
 * and these are the names it returns.
 */
describe('Refusing an entry path that escapes the archive root', () => {
	it.each([
		['a parent reference', '../escaped.md'],
		['a nested parent reference', 'notes/../../escaped.md'],
		['a Windows-style parent reference', 'a\\..\\..\\escaped.md'],
		['a bare parent directory', '..'],
		['an empty name', '']
	])('refuses %s', (_label, path) => {
		expect(archiveEntryPath(path)).toBeUndefined();
	});

	it.each([
		['a plain file', 'one.md', 'one.md'],
		['a nested file', 'notes/one.md', 'notes/one.md'],
		// Made root-relative rather than refused, which is what unzip itself does: the
		// path lands inside the import, and an absolute one cannot reach outside it.
		['a leading slash', '/notes/one.md', 'notes/one.md'],
		['an absolute path', '/etc/passwd', 'etc/passwd'],
		['Windows separators', 'notes\\one.md', 'notes/one.md'],
		['a redundant current directory', './notes/one.md', 'notes/one.md'],
		['a name merely containing dots', 'notes/v1..2.md', 'notes/v1..2.md']
	])('accepts %s', (_label, path, expected) => {
		expect(archiveEntryPath(path)).toBe(expected);
	});
});
