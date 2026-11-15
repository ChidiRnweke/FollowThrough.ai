import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import {
	parseMarkdownNote,
	readMarkdownArchive,
	type ArchiveEntry,
	type ArchiveLimits
} from './archive-reader.server';
import { declaringSize } from '$lib/testing/zip/fixtures/declared-size';

const limits: ArchiveLimits = { maxTotalBytes: 25 * 1024 * 1024, maxEntries: 2000 };

/** Archives are built in memory, so the suite needs no fixture files. */
const zipOf = (files: Readonly<Record<string, string>>): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files))
		zip.addFile(path, Buffer.from(content, 'utf8'));
	return new Uint8Array(zip.toBuffer());
};

const read = (files: Readonly<Record<string, string>>, archiveLimits = limits) =>
	readMarkdownArchive(zipOf(files), archiveLimits);

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
		const outcome = read({ 'big.md': 'x'.repeat(4096) }, { ...limits, maxTotalBytes: 1024 });
		expect(outcome.ok === false && outcome.rejection.reason).toBe('too_large');
	});

	it('rejects an archive with too many files', () => {
		const files = Object.fromEntries(
			Array.from({ length: 5 }, (_unused, index) => [`note-${index}.md`, '# x'])
		);
		const outcome = read(files, { ...limits, maxEntries: 3 });
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

/** ZIP compression methods (application note 4.4.5); adm-zip writes deflate by default. */
const STORED = 0;
const DEFLATED = 8;

const zipWithMethod = (files: Readonly<Record<string, string>>, method: number): Uint8Array => {
	const zip = new AdmZip();
	for (const [path, content] of Object.entries(files)) {
		zip.addFile(path, Buffer.from(content, 'utf8'));
		zip.getEntry(path)!.header.method = method;
	}
	return new Uint8Array(zip.toBuffer());
};

describe('Counting the bytes an archive actually inflates to', () => {
	const budget: ArchiveLimits = { ...limits, maxTotalBytes: 1024 };

	it.each([
		['deflated', DEFLATED],
		['stored', STORED]
	])(
		'refuses an archive whose %s entry declares no size but expands past the budget',
		(_label, method) => {
			const archive = declaringSize(
				zipWithMethod({ 'big.md': 'x'.repeat(4096) }, method),
				'big.md',
				0
			);
			const outcome = readMarkdownArchive(archive, budget);
			expect(outcome.ok === false && outcome.rejection).toEqual({
				reason: 'too_large',
				size: { kind: 'inflated' },
				limit: 1024
			});
		}
	);

	it('refuses entries that each fit the budget but together expand past it', () => {
		const archive = declaringSize(
			declaringSize(zipOf({ 'one.md': 'x'.repeat(600), 'two.md': 'y'.repeat(600) }), 'one.md', 0),
			'two.md',
			0
		);
		const outcome = readMarkdownArchive(archive, budget);
		expect(outcome.ok === false && outcome.rejection).toEqual({
			reason: 'too_large',
			size: { kind: 'inflated' },
			limit: 1024
		});
	});

	it('skips an entry whose content differs from its declared size and imports the rest', () => {
		const archive = declaringSize(
			zipOf({ 'short.md': '# Declared as empty', 'kept.md': '# Kept' }),
			'short.md',
			0
		);
		const outcome = readMarkdownArchive(archive, budget);
		expect(
			outcome.ok && {
				entries: outcome.result.entries.map((file) => file.text),
				skipped: outcome.result.skipped.map((skip) => skip.path)
			}
		).toEqual({ entries: ['# Kept'], skipped: ['short.md'] });
	});

	it('imports an archive whose entries expand to exactly the budget', () => {
		const outcome = read({ 'one.md': 'x'.repeat(512), 'two.md': 'y'.repeat(512) }, budget);
		expect(outcome.ok && outcome.result.entries.map((file) => file.text.length)).toEqual([
			512, 512
		]);
	});

	it('imports a stored entry and an empty entry beside a deflated one', () => {
		const stored = zipWithMethod({ 'stored.md': '# Stored', 'empty.md': '' }, STORED);
		const zip = new AdmZip(Buffer.from(stored));
		zip.addFile('deflated.md', Buffer.from('# Deflated', 'utf8'));
		const outcome = readMarkdownArchive(new Uint8Array(zip.toBuffer()), budget);
		expect(
			outcome.ok && Object.fromEntries(outcome.result.entries.map((file) => [file.path, file.text]))
		).toEqual({ 'stored.md': '# Stored', 'empty.md': '', 'deflated.md': '# Deflated' });
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
	const parse = (text: string) => parseMarkdownNote(entry('one.md', text));

	it('strips frontmatter from the body rather than rendering it as prose', () => {
		const note = parse('---\ntags: [a]\nauthor: Ada\n---\nBody.');
		expect({ markdown: note.markdown, keys: note.frontmatterKeys }).toEqual({
			markdown: 'Body.',
			keys: ['tags', 'author']
		});
	});

	it('still strips a malformed block instead of showing raw YAML', () => {
		const note = parse('---\n: : :\n---\nBody.');
		expect({ markdown: note.markdown, keys: note.frontmatterKeys }).toEqual({
			markdown: 'Body.',
			keys: []
		});
	});

	it('leaves a body with no frontmatter untouched', () => {
		expect(parse('Just prose.').markdown).toBe('Just prose.');
	});

	it('does not treat a thematic break as frontmatter', () => {
		const note = parse('Intro.\n\n---\n\nMore.');
		expect({ markdown: note.markdown, keys: note.frontmatterKeys }).toEqual({
			markdown: 'Intro.\n\n---\n\nMore.',
			keys: []
		});
	});
});

/**
 * adm-zip's writer strips traversal from a name as it packs it, so a hostile archive is
 * made by writing a same-length placeholder name and patching the stored name bytes
 * (local header and central directory) afterwards, as a malicious tool would.
 */
const archiveNamed = (placeholder: string, name: string): Uint8Array => {
	const bytes = zipOf({ [placeholder]: '# Escaped' });
	const from = Buffer.from(placeholder);
	const to = Buffer.from(name);
	const buffer = Buffer.from(bytes);
	for (let at = buffer.indexOf(from); at !== -1; at = buffer.indexOf(from, at + 1))
		to.copy(buffer, at);
	return new Uint8Array(buffer);
};

describe('Refusing an entry path that escapes the archive root', () => {
	it.each([
		['a parent reference', 'xx/escaped.md', '../escaped.md'],
		['a nested parent reference', 'notes/xx/xx/escaped.md', 'notes/../../escaped.md'],
		['a Windows-style parent reference', 'axxaxxxxescaped.md', 'a\\..\\..\\escaped.md']
	])('refuses %s', (_label, placeholder, name) => {
		const outcome = readMarkdownArchive(archiveNamed(placeholder, name));
		expect(outcome.ok === false && outcome.rejection).toEqual({
			reason: 'unsafe_path',
			path: name
		});
	});

	it.each([
		['a leading slash', 'xnotes/one.md', '/notes/one.md', 'notes/one.md'],
		['an absolute path', 'xetc/passwd.md', '/etc/passwd.md', 'etc/passwd.md'],
		['Windows separators', 'notes_one.md', 'notes\\one.md', 'notes/one.md'],
		['a redundant current directory', 'xxnotes/one.md', './notes/one.md', 'notes/one.md'],
		['a name merely containing dots', 'notes/vx..2.md', 'notes/v1..2.md', 'notes/v1..2.md']
	])('keeps %s inside the import', (_label, placeholder, name, expected) => {
		const outcome = readMarkdownArchive(archiveNamed(placeholder, name));
		expect(outcome.ok && outcome.result.entries.map((e) => e.path)).toEqual([expected]);
	});
});
