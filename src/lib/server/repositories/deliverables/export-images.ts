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

export function collectImageSources(doc: ProseMirrorDocument): string[] {
	const sources: string[] = [];
	const walk = (node: Record<string, unknown>): void => {
		if (node.type === 'image') {
			const src = (node.attrs as Record<string, unknown> | undefined)?.src;
			if (typeof src === 'string' && /^https?:\/\//.test(src)) sources.push(src);
		}
		for (const child of (node.content as Array<Record<string, unknown>> | undefined) ?? [])
			walk(child);
	};
	walk(doc as unknown as Record<string, unknown>);
	return sources;
}

/** Fetch remote images and inline them as data URLs; failures are skipped, never fatal. */
export async function fetchImages(sources: readonly string[]): Promise<Map<string, string>> {
	const images = new Map<string, string>();
	await Promise.all(
		[...new Set(sources)].map(async (src) => {
			try {
				const response = await fetch(src, {
					signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
					redirect: 'follow'
				});
				if (!response.ok) return;
				const mediaType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
				if (!EMBEDDABLE_IMAGE_TYPES.has(mediaType)) return;
				const bytes = Buffer.from(await response.arrayBuffer());
				if (bytes.byteLength > IMAGE_MAX_BYTES) return;
				images.set(src, `data:${mediaType};base64,${bytes.toString('base64')}`);
			} catch {
				// Unreachable images degrade to a placeholder in the document.
			}
		})
	);
	return images;
}
