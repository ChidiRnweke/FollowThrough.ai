import { createHash } from 'node:crypto';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { svgViewBoxSize } from '$lib/models/deliverables';

/**
 * Helpers shared by the PDF and DOCX generators: mermaid source hashing, SVG
 * sizing, and remote-image fetching. Both formats embed the same browser-rendered
 * diagrams and fetched images, so the fetching and hashing live here exactly once.
 */

export const mermaidSourceHash = (source: string): string =>
	createHash('sha256').update(source, 'utf8').digest('hex');

/** Natural size of an SVG, from its viewBox. The parse is shared with the browser. */
export const svgDimensions = svgViewBoxSize;

const IMAGE_FETCH_TIMEOUT_MS = 8000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const EMBEDDABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

/**
 * App-owned images live as relative, cookie-authenticated attachment URLs
 * (`/api/attachments/<id>/content`) inside a note document. The generator cannot
 * fetch those itself — it has no session — so the service resolves each one to a
 * presigned download URL before embedding it.
 */
const ATTACHMENT_SRC = /\/api\/attachments\/([^/]+)\/content$/;

const isRemoteSource = (src: string): boolean => /^https?:\/\//.test(src);

/** The attachment id behind an app-owned content URL, or `undefined` for any other source. */
export function attachmentIdFromSrc(src: string): string | undefined {
	return ATTACHMENT_SRC.exec(src)?.[1];
}

export function collectImageSources(doc: ProseMirrorDocument): string[] {
	const sources: string[] = [];
	const walk = (node: Record<string, unknown>): void => {
		if (node.type === 'image') {
			const attrs = node.attrs;
			const src =
				typeof attrs === 'object' && attrs !== null && 'src' in attrs ? attrs.src : undefined;
			if (typeof src === 'string' && (isRemoteSource(src) || ATTACHMENT_SRC.test(src)))
				sources.push(src);
		}
		if (!Array.isArray(node.content)) return;
		for (const child of node.content) if (typeof child === 'object' && child !== null) walk(child);
	};
	walk({ type: doc.type, content: doc.content });
	return sources;
}

/**
 * Fetch a single image URL and inline it as a data URL. Returns `undefined` for
 * non-embeddable responses, oversized payloads, or any fetch failure.
 */
export async function fetchRemoteDataUrl(url: string): Promise<string | undefined> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
		redirect: 'follow'
	});
	if (!response.ok) throw new Error(`Image fetch failed with status ${response.status}`);
	const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
	if (!EMBEDDABLE_IMAGE_TYPES.has(mediaType)) return undefined;
	const bytes = Buffer.from(await response.arrayBuffer());
	if (bytes.byteLength > IMAGE_MAX_BYTES) return undefined;
	return `data:${mediaType};base64,${bytes.toString('base64')}`;
}

/**
 * A source-specific fetcher: returns a data URL for a src the caller knows how to
 * reach (an app-owned attachment via the actor), or `undefined` when it cannot.
 */
export type ImageSourceResolver = (src: string) => Promise<string | undefined>;

/**
 * Fetch remote images and inline them as data URLs; failures are skipped, never fatal.
 *
 * Remote `http(s)` sources are fetched directly. App-owned relative attachment sources
 * are handed to `resolve`, which returns a data URL minted through the actor's download
 * URL (or `undefined`, degrading the image to a placeholder).
 */
export async function fetchImages(
	sources: readonly string[],
	resolve: ImageSourceResolver = async () => undefined
): Promise<Map<string, string>> {
	const images = new Map<string, string>();
	await Promise.all(
		[...new Set(sources)].map(async (src) => {
			// Document-authored URLs are untrusted. The injected resolver is the only
			// authority allowed to turn a source into bytes (for example, by resolving
			// an actor-authorized attachment to a short-lived storage URL).
			const data = await resolve(src);
			if (data) images.set(src, data);
		})
	);
	return images;
}
