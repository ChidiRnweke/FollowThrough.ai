import { createHash } from 'node:crypto';

/**
 * Helpers shared by the PDF and DOCX generators: mermaid source hashing
 * and remote-image fetching. Both formats embed the same browser-rendered
 * diagrams and fetched images, so the fetching and hashing live here exactly once.
 */

export const mermaidSourceHash = (source: string): string =>
	createHash('sha256').update(source, 'utf8').digest('hex');

const IMAGE_FETCH_TIMEOUT_MS = 8000;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const EMBEDDABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

/**
 * Fetch a single image URL and inline it as a data URL. Returns `undefined` for
 * non-embeddable responses or oversized payloads. Network and HTTP failures propagate.
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
