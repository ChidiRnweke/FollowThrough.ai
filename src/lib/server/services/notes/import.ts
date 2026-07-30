import AdmZip from 'adm-zip';
import { parse as parseYaml } from 'yaml';

/**
 * Reading a zip of Markdown notes.
 *
 * Pure: unzipping, validating and parsing only, with no controllers and no database, so
 * the parts that decide what a file becomes — and the parts that refuse a hostile archive
 * — are testable without a workspace.
 *
 * `adm-zip` offers no protection of its own. It will hand back an entry whose path escapes
 * the archive root and will happily decompress a small archive into gigabytes, so every
 * limit here is enforced against the *declared* uncompressed size before any entry is
 * read.
 */

export interface ArchiveEntry {
	/** Normalised, root-relative, no leading slash. */
	readonly path: string;
	readonly segments: readonly string[];
	readonly text: string;
}

export interface ParsedMarkdownNote {
	readonly path: string;
	/** Folder segments above the note, root-relative. */
	readonly folders: readonly string[];
	readonly title: string;
	/** Frontmatter removed; the body otherwise kept as written. */
	readonly markdown: string;
	readonly frontmatterKeys: readonly string[];
}

export interface ArchiveLimits {
	readonly maxTotalBytes: number;
	readonly maxEntries: number;
	readonly maxFileBytes: number;
	readonly maxDepth: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
	maxTotalBytes: 25 * 1024 * 1024,
	maxEntries: 2000,
	maxFileBytes: 1024 * 1024,
	maxDepth: 8
};

export type ArchiveRejection =
	| { readonly reason: 'not_a_zip' }
	| { readonly reason: 'too_large'; readonly bytes: number; readonly limit: number }
	| { readonly reason: 'too_many_entries'; readonly entries: number; readonly limit: number }
	| { readonly reason: 'unsafe_path'; readonly path: string };

export interface ArchiveSkip {
	readonly path: string;
	readonly reason: string;
}

export interface ArchiveReadResult {
	readonly entries: readonly ArchiveEntry[];
	readonly skipped: readonly ArchiveSkip[];
}

export type ReadArchiveOutcome =
	| { readonly ok: true; readonly result: ArchiveReadResult }
	| { readonly ok: false; readonly rejection: ArchiveRejection };

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

const isMarkdown = (path: string): boolean =>
	MARKDOWN_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension));

/**
 * Root-relative path, or undefined when the entry tries to escape.
 *
 * Backslashes are folded to `/` because archives written on Windows use them as
 * separators, which would otherwise smuggle a `..\..` past a `/`-only check.
 *
 * Exported so the guard can be tested against the names a hostile archive carries:
 * `adm-zip`'s *writer* strips traversal from a name as it packs it, so a malicious
 * archive cannot be constructed with `addFile` — only its reader hands such names back.
 */
export const archiveEntryPath = (raw: string): string | undefined => {
	const normalised = raw.replace(/\\/g, '/').replace(/^\/+/, '');
	const segments = normalised.split('/').filter((segment) => segment !== '' && segment !== '.');
	if (segments.length === 0) return undefined;
	if (segments.some((segment) => segment === '..')) return undefined;
	return segments.join('/');
};

const IGNORED_PREFIXES = ['__MACOSX/', '.git/', '.obsidian/', '.trash/'];

const isIgnored = (path: string): boolean => {
	if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
	// Dotfiles and dot-directories anywhere in the path.
	return path.split('/').some((segment) => segment.startsWith('.'));
};

export const readMarkdownArchive = (
	archive: Uint8Array,
	limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS
): ReadArchiveOutcome => {
	let zip: AdmZip;
	try {
		zip = new AdmZip(Buffer.from(archive));
	} catch {
		return { ok: false, rejection: { reason: 'not_a_zip' } };
	}

	let raw: AdmZip.IZipEntry[];
	try {
		raw = zip.getEntries();
	} catch {
		return { ok: false, rejection: { reason: 'not_a_zip' } };
	}

	const files = raw.filter((entry) => !entry.isDirectory);
	if (files.length > limits.maxEntries)
		return {
			ok: false,
			rejection: { reason: 'too_many_entries', entries: files.length, limit: limits.maxEntries }
		};

	// Declared sizes, checked before decompressing anything: a zip bomb is small on disk
	// and enormous once expanded, so reading first and measuring after is the trap.
	const declaredTotal = files.reduce((total, entry) => total + (entry.header?.size ?? 0), 0);
	if (declaredTotal > limits.maxTotalBytes)
		return {
			ok: false,
			rejection: { reason: 'too_large', bytes: declaredTotal, limit: limits.maxTotalBytes }
		};

	const entries: ArchiveEntry[] = [];
	const skipped: ArchiveSkip[] = [];

	for (const entry of files) {
		const path = archiveEntryPath(entry.entryName);
		if (!path) return { ok: false, rejection: { reason: 'unsafe_path', path: entry.entryName } };
		if (isIgnored(path)) continue;
		if (!isMarkdown(path)) {
			skipped.push({ path, reason: 'Not a Markdown file' });
			continue;
		}
		const segments = path.split('/');
		if (segments.length - 1 > limits.maxDepth) {
			skipped.push({ path, reason: `Nested deeper than ${limits.maxDepth} folders` });
			continue;
		}
		if ((entry.header?.size ?? 0) > limits.maxFileBytes) {
			skipped.push({ path, reason: 'Larger than the per-file limit' });
			continue;
		}
		let text: string;
		try {
			text = zip.readAsText(entry);
		} catch {
			skipped.push({ path, reason: 'Could not be read' });
			continue;
		}
		entries.push({ path, segments, text });
	}

	return { ok: true, result: { entries, skipped } };
};

interface Frontmatter {
	readonly keys: readonly string[];
	readonly body: string;
}

/** Split and parse a leading YAML frontmatter block, tolerating a malformed one. */
export const splitFrontmatter = (source: string): Frontmatter => {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	if (!match) return { keys: [], body: source };
	const body = source.slice(match[0].length);
	let parsed: unknown;
	try {
		parsed = parseYaml(match[1]);
	} catch {
		// Malformed YAML is still frontmatter: strip it rather than rendering it as prose.
		return { keys: [], body };
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
		return { keys: [], body };
	return { keys: Object.keys(parsed as Record<string, unknown>), body };
};

const titleFromFileName = (fileName: string): string => {
	const withoutExtension = fileName.replace(/\.(md|markdown|mdx)$/i, '');
	return withoutExtension.replace(/[-_]+/g, ' ').trim() || 'Untitled';
};

/**
 * The file name names the note, never the document's own frontmatter or headings.
 *
 * Imported notes keep the name the user already knows them by on disk; a leading
 * heading is the document's first line, so it stays in the body rather than being
 * promoted to the title and stripped.
 */
export const parseMarkdownNote = (entry: ArchiveEntry): ParsedMarkdownNote => {
	const frontmatter = splitFrontmatter(entry.text);
	const fileName = entry.segments[entry.segments.length - 1];
	const folders = entry.segments.slice(0, -1);
	return {
		path: entry.path,
		folders,
		title: titleFromFileName(fileName),
		markdown: frontmatter.body.trimStart(),
		frontmatterKeys: frontmatter.keys
	};
};

/** Frontmatter keys the importer does not map, so the report can name what was left. */
export const unmappedFrontmatterKeys = (
	notes: readonly ParsedMarkdownNote[]
): readonly string[] => {
	const mapped = new Set<string>();
	const seen = new Set<string>();
	for (const note of notes)
		for (const key of note.frontmatterKeys) if (!mapped.has(key)) seen.add(key);
	return [...seen].sort();
};

/**
 * Make a title unique within its folder by suffixing ` (2)`, ` (3)`, …
 *
 * Import is additive by definition: a name collision must never merge two notes or
 * overwrite one that was already there.
 */
export const uniqueTitleIn = (taken: Set<string>, title: string): string => {
	if (!taken.has(title)) {
		taken.add(title);
		return title;
	}
	let suffix = 2;
	while (taken.has(`${title} (${suffix})`)) suffix += 1;
	const unique = `${title} (${suffix})`;
	taken.add(unique);
	return unique;
};

export const describeArchiveRejection = (rejection: ArchiveRejection): string => {
	switch (rejection.reason) {
		case 'not_a_zip':
			return 'That file is not a readable zip archive.';
		case 'too_large':
			return `The archive expands to ${Math.round(rejection.bytes / 1024 / 1024)} MB, over the ${Math.round(rejection.limit / 1024 / 1024)} MB limit.`;
		case 'too_many_entries':
			return `The archive holds ${rejection.entries} files, over the ${rejection.limit} limit.`;
		case 'unsafe_path':
			return `The archive contains an unsafe path (${rejection.path}) and was not imported.`;
	}
};
