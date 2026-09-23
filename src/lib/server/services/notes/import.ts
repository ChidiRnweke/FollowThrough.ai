import type {
	ParsedMarkdownNote,
	ArchiveNoteReference,
	ArchiveLinkIssue,
	ArchiveReferenceIndex
} from '$lib/models/projects';
const WIKI_LINK_PATTERN = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

const archivePathKey = (value: string): string | undefined => {
	const segments: string[] = [];
	for (const part of value.replace(/\\/g, '/').split('/')) {
		if (!part || part === '.') continue;
		if (part === '..') {
			if (!segments.length) return undefined;
			segments.pop();
		} else segments.push(part);
	}
	return segments
		.join('/')
		.replace(/\.(?:md|markdown|mdx)$/i, '')
		.normalize('NFC')
		.toLowerCase();
};

/** Prepare once for the archive, rather than scanning every entry for every link. */
export function indexArchiveReferences(
	references: readonly ArchiveNoteReference[]
): ArchiveReferenceIndex {
	const paths = new Map<string, ArchiveNoteReference[]>();
	const titles = new Map<string, ArchiveNoteReference[]>();
	for (const reference of references) {
		const path = archivePathKey(reference.path);
		const title = reference.title
			.replace(/\.(?:md|markdown|mdx)$/i, '')
			.normalize('NFC')
			.toLowerCase();
		if (path === undefined) throw new Error('Invalid archive reference identity');
		paths.set(path, [...(paths.get(path) ?? []), reference]);
		titles.set(title, [...(titles.get(title) ?? []), reference]);
	}
	return { paths, titles };
}

/** Resolve against archive identities, including entries whose creation failed. */
export function resolveArchiveLinks(
	note: ParsedMarkdownNote,
	references: ArchiveReferenceIndex
): { markdown: string; issues: ArchiveLinkIssue[] } {
	const issues: ArchiveLinkIssue[] = [];
	const markdown = note.markdown.replace(
		WIKI_LINK_PATTERN,
		(whole, rawTarget: string, rawLabel?: string) => {
			const target = rawTarget.trim();
			if (target.includes('#')) {
				issues.push({ path: note.path, target, reason: 'unsupported' });
				return whole;
			}
			const qualified = /[/\\]/.test(target);
			const key = archivePathKey(
				/^\.\.?[/\\]/.test(target) ? `${note.folders.join('/')}/${target}` : target
			);
			const matches =
				key === undefined
					? []
					: ((qualified ? references.paths : references.titles).get(key) ?? []);
			const candidate = matches[0];
			if (matches.length !== 1 || !candidate || candidate.outcome.kind !== 'created') {
				issues.push({
					path: note.path,
					target,
					reason: matches.length > 1 ? 'ambiguous' : candidate ? 'unavailable' : 'missing'
				});
				return whole;
			}
			const label = (rawLabel ?? rawTarget).trim().replace(/[\\[\]]/g, '\\$&');
			return `[${label}](note:${candidate.outcome.id})`;
		}
	);
	return { markdown, issues };
}

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
