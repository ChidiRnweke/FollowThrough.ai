import AdmZip from 'adm-zip';
import { parse as parseYaml } from 'yaml';
import type { ParsedMarkdownNote } from '$lib/models/projects';
import {
	BoundedZipReader,
	type ZipEntryFailure
} from '$lib/server/infrastructure/zip/bounded-entries';

/**
 * Parse uploaded archive bytes at the transport boundary before invoking the controller.
 *
 * Pure: unzipping, validating and parsing only, with no controllers and no database, so
 * the parts that decide what a file becomes — and the parts that refuse a hostile archive
 * — are testable without a workspace.
 *
 * `adm-zip` offers no protection of its own. It will hand back an entry whose path escapes
 * the archive root and will happily decompress a small archive into gigabytes. The declared
 * uncompressed sizes are checked before any entry is read, and every entry is then inflated
 * against what remains of the same budget, because a header can declare less than it holds.
 */

export interface ArchiveEntry {
	/** Normalised, root-relative, no leading slash. */
	readonly path: string;
	readonly segments: readonly string[];
	readonly text: string;
}

export interface ArchiveLimits {
	readonly maxTotalBytes: number;
	readonly maxEntries: number;
}

const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
	maxTotalBytes: 25 * 1024 * 1024,
	maxEntries: 2000
};

/**
 * What was measured against the expanded-bytes limit: the uploaded file itself, the sizes
 * the archive declares, or the bytes an entry actually inflated to, which stop at the limit.
 */
export type ArchiveSize =
	| { readonly kind: 'upload'; readonly bytes: number }
	| { readonly kind: 'declared'; readonly bytes: number }
	| { readonly kind: 'inflated' };

export type ArchiveRejection =
	| { readonly reason: 'not_a_zip' }
	| { readonly reason: 'too_large'; readonly size: ArchiveSize; readonly limit: number }
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
 */
const archiveEntryPath = (raw: string): string | undefined => {
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

/** Why one entry is skipped while the rest of the archive still imports (ADR 0014). */
const entrySkipReason = (reason: Exclude<ZipEntryFailure, 'over_budget'>): string => {
	switch (reason) {
		case 'unsupported_method':
			return 'Uses a compression method other than stored or deflate';
		case 'corrupt_data':
			return 'Could not be read';
		case 'size_mismatch':
			return 'Its size differs from the size the archive declares for it';
		case 'crc_mismatch':
			return 'Its checksum differs from the checksum the archive declares for it';
	}
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
	const declaredTotal = files.reduce((total, entry) => total + entry.header.size, 0);
	if (declaredTotal > limits.maxTotalBytes)
		return {
			ok: false,
			rejection: {
				reason: 'too_large',
				size: { kind: 'declared', bytes: declaredTotal },
				limit: limits.maxTotalBytes
			}
		};

	const entries: ArchiveEntry[] = [];
	const skipped: ArchiveSkip[] = [];
	const reader = new BoundedZipReader(limits.maxTotalBytes);

	for (const entry of files) {
		const path = archiveEntryPath(entry.entryName);
		if (!path) return { ok: false, rejection: { reason: 'unsafe_path', path: entry.entryName } };
		if (isIgnored(path)) continue;
		if (!isMarkdown(path)) {
			skipped.push({ path, reason: 'Not a Markdown file' });
			continue;
		}
		const read = reader.read(entry);
		if (read.kind === 'failure') {
			if (read.reason === 'over_budget')
				return {
					ok: false,
					rejection: {
						reason: 'too_large',
						size: { kind: 'inflated' },
						limit: limits.maxTotalBytes
					}
				};
			skipped.push({ path, reason: entrySkipReason(read.reason) });
			continue;
		}
		entries.push({ path, segments: path.split('/'), text: read.bytes.toString('utf8') });
	}

	return { ok: true, result: { entries, skipped } };
};

interface Frontmatter {
	readonly keys: readonly string[];
	readonly body: string;
}

/**
 * The keys a frontmatter block declares, or the news that it declares none.
 *
 * `corrupt` covers both ways a block can fail to name any: YAML that will not
 * parse, and YAML that parses to something other than a mapping. They are one
 * answer here, because the
 * caller does the same thing with both: strip the block and record no keys.
 * Only the first used to be an exception, and it escaped `splitFrontmatter`
 * entirely \u2014 so one file with a malformed block failed the import it was part
 * of, rather than being imported with its frontmatter stripped like every other
 * file whose frontmatter says nothing usable.
 */
type FrontmatterBlock =
	{ readonly kind: 'keys'; readonly keys: readonly string[] } | { readonly kind: 'corrupt' };

const frontmatterBlock = (block: string): FrontmatterBlock => {
	try {
		const parsed: unknown = parseYaml(block);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
			return { kind: 'corrupt' };
		return { kind: 'keys', keys: Object.keys(parsed) };
	} catch {
		return { kind: 'corrupt' };
	}
};

/** Split and parse a leading YAML frontmatter block, tolerating a malformed one. */
const splitFrontmatter = (source: string): Frontmatter => {
	const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
	if (!match) return { keys: [], body: source };
	const body = source.slice(match[0].length);
	// Stripped either way: a reader who sees `: : :` at the top of their note has
	// been shown the delimiter's contents, which is worse than showing nothing.
	const parsed = frontmatterBlock(match[1]!);
	return { keys: parsed.kind === 'keys' ? parsed.keys : [], body };
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

const megabytes = (bytes: number): number => Math.round(bytes / 1024 / 1024);

const describeArchiveSize = (size: ArchiveSize): string => {
	switch (size.kind) {
		case 'upload':
			return `The archive file is ${megabytes(size.bytes)} MB, over`;
		case 'declared':
			return `The archive expands to ${megabytes(size.bytes)} MB, over`;
		case 'inflated':
			return 'The archive expands past';
	}
};

export const describeArchiveRejection = (rejection: ArchiveRejection): string => {
	switch (rejection.reason) {
		case 'not_a_zip':
			return 'That file is not a readable zip archive.';
		case 'too_large':
			return `${describeArchiveSize(rejection.size)} the ${megabytes(rejection.limit)} MB ARCHIVE_MAX_EXPANDED_BYTES setting.`;
		case 'too_many_entries':
			return `The archive holds ${rejection.entries} files, over the ${rejection.limit} ARCHIVE_MAX_ENTRIES setting.`;
		case 'unsafe_path':
			return `The archive contains an unsafe path (${rejection.path}) and was not imported.`;
	}
};
