import AdmZip from 'adm-zip';

/**
 * Writing a zip of generated documents.
 *
 * Pure: bytes in, bytes out, with no workspace and no storage, so the naming rules that
 * decide what a reader sees when they open the archive are testable on their own.
 */

export interface BundleFile {
	/** Folder-relative, extension included. Sanitized here, so callers may pass note titles. */
	readonly path: string;
	readonly bytes: Uint8Array;
}

const RESERVED_SEGMENTS = new Set(['', '.', '..']);

/** Characters a zip reader treats as structure, or that Windows refuses in a file name. */
const FORBIDDEN_CHARACTERS = '/\\:*?"<>|';

/**
 * A single path segment a file manager can show and a zip reader can extract.
 *
 * Separators, control characters and the characters Windows refuses are dropped rather than
 * escaped: the segment is a display name, and a note titled `Q3/Q4 plan` should read as
 * `Q3Q4 plan`, not carry an encoding. A leading dot goes too — a note is not a dotfile, and
 * the importer skips those on the way back in.
 */
const safeSegment = (raw: string): string => {
	const kept = [...raw]
		.filter(
			(character) =>
				!FORBIDDEN_CHARACTERS.includes(character) && (character.codePointAt(0) ?? 0) >= 0x20
		)
		.join('');
	const cleaned = kept.replace(/^\.+/, '').trim().slice(0, 120).trim();
	// A traversal or empty segment is dropped rather than renamed: `../notes` should
	// flatten to `notes`, not gain a folder called `document`.
	return RESERVED_SEGMENTS.has(cleaned) ? '' : cleaned;
};

const safePath = (raw: string): string => {
	const segments = raw
		.replace(/\\/g, '/')
		.split('/')
		.map(safeSegment)
		.filter((segment) => segment !== '');
	return segments.length === 0 ? 'document' : segments.join('/');
};

/**
 * Two notes may share a title — inside one folder, or because sanitizing collapsed them
 * together — and a zip that silently keeps one of them loses a document. Collisions get the
 * familiar ` (2)` suffix before the extension instead.
 */
const dedupe = (path: string, taken: ReadonlySet<string>): string => {
	if (!taken.has(path)) return path;
	const dot = path.lastIndexOf('.');
	const stem = dot > 0 ? path.slice(0, dot) : path;
	const extension = dot > 0 ? path.slice(dot) : '';
	for (let counter = 2; ; counter += 1) {
		const candidate = `${stem} (${counter})${extension}`;
		if (!taken.has(candidate)) return candidate;
	}
};

/**
 * Pack documents into a zip. Names are sanitized and de-duplicated, so every file handed in
 * comes back out — `packZip` never drops one.
 */
export function packZip(files: readonly BundleFile[]): Buffer {
	const zip = new AdmZip();
	const taken = new Set<string>();
	for (const file of files) {
		const path = dedupe(safePath(file.path), taken);
		taken.add(path);
		zip.addFile(path, Buffer.from(file.bytes));
	}
	return zip.toBuffer();
}
