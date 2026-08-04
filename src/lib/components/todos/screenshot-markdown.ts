/** Media types a todo description accepts as an inline screenshot. */
export const SCREENSHOT_MEDIA_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif'
]);

/**
 * Per-image ceiling for a pasted screenshot. Well under the server's
 * `ATTACHMENT_MAX_BYTES`, because this one is about keeping a paste feeling
 * instant rather than about what storage can hold.
 */
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;

/** The image files in a paste or drop that a description can actually take. */
export const screenshotsFrom = (files: FileList | null | undefined): readonly File[] =>
	Array.from(files ?? []).filter((file) => SCREENSHOT_MEDIA_TYPES.has(file.type));

/**
 * The markdown for an uploaded screenshot. Square brackets in a file name would
 * otherwise terminate the alt text early and leave the rest as loose prose.
 */
export const screenshotMarkdown = (name: string, url: string): string =>
	`![${name.replaceAll('[', '(').replaceAll(']', ')')}](${url})`;

/**
 * Splices a snippet into the description at the caret, replacing whatever was
 * selected, and reports where the caret should land afterwards.
 *
 * The snippet is padded onto its own line when it would otherwise butt against
 * neighbouring prose — an image link glued to the end of a sentence renders as
 * part of that paragraph rather than as the screenshot it is.
 */
export const insertAtCaret = (
	text: string,
	selectionStart: number,
	selectionEnd: number,
	snippet: string
): { text: string; caret: number } => {
	const start = Math.max(0, Math.min(selectionStart, text.length));
	const end = Math.max(start, Math.min(selectionEnd, text.length));
	const before = text.slice(0, start);
	const after = text.slice(end);
	const lead = before && !before.endsWith('\n') ? '\n\n' : '';
	const trail = after && !after.startsWith('\n') ? '\n\n' : '';
	const inserted = `${lead}${snippet}${trail}`;
	return { text: `${before}${inserted}${after}`, caret: start + lead.length + snippet.length };
};
