import { getTextBetween, getTextSerializersFromSchema } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import type { EditorState } from '@tiptap/pm/state';
import { mermaidPngBlob } from '../mermaid-export.js';
import type { MermaidTheme } from '../mermaid-rendering.js';
import { selectionMedia } from './diagram-copy.js';

const BLOCK_SEPARATOR = '\n\n';

/**
 * Ceilings for one copy. Rendering a diagram costs a mermaid pass and a canvas
 * rasterise, and a data URI is a third larger than the bytes it carries, so a
 * note full of pictures could otherwise stall the copy or produce a clipboard
 * payload the receiving application refuses. Anything past a ceiling keeps its
 * original serialization rather than failing the copy.
 */
const MAX_INLINED_DIAGRAMS = 24;
const MAX_INLINED_BYTES = 12 * 1024 * 1024;

/** The mermaid theme the diagrams are currently rendered at on screen. */
export const activeMermaidTheme = (): MermaidTheme => ({
	base: window.document.documentElement.classList.contains('dark') ? 'dark' : 'light'
});

/** Plain text of the current selection, '' when there is none. */
export const selectionPlainText = (state: EditorState): string => {
	const { from, to, empty } = state.selection;
	if (empty) return '';
	return getTextBetween(
		state.doc,
		{ from, to },
		{
			blockSeparator: BLOCK_SEPARATOR,
			textSerializers: getTextSerializersFromSchema(state.schema)
		}
	);
};

const dataUri = (blob: Blob): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'));
		reader.readAsDataURL(blob);
	});

/**
 * The bytes behind an image node's `src`. Attachment URLs are relative and
 * cookie-authenticated, so they are fetched from this origin with credentials;
 * a cross-origin source is left alone because CORS would refuse it anyway.
 */
const fetchSameOrigin = async (src: string): Promise<Blob | undefined> => {
	const url = new URL(src, window.location.origin);
	if (url.origin !== window.location.origin) return undefined;
	const response = await fetch(url.href, { credentials: 'same-origin' });
	if (!response.ok) return undefined;
	return await response.blob();
};

/**
 * An image node's bytes as PNG. `ClipboardItem` support for other image types is
 * uneven, so anything else goes through a canvas first.
 */
export const imagePngBlob = async (src: string): Promise<Blob> => {
	const blob = await fetchSameOrigin(src);
	if (!blob) throw new Error('The image could not be read');
	if (blob.type === 'image/png') return blob;
	const bitmap = await createImageBitmap(blob);
	try {
		const canvas = window.document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('The image could not be converted');
		context.drawImage(bitmap, 0, 0);
		return await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(png) => (png ? resolve(png) : reject(new Error('The image could not be converted'))),
				'image/png'
			)
		);
	} finally {
		bitmap.close();
	}
};

/**
 * The selection as rich HTML with every picture embedded.
 *
 * The formatting is ProseMirror's own serialization — that already pastes well
 * into a word processor — with two substitutions layered on top: a mermaid node
 * becomes the PNG it renders as rather than its source text, and an image node's
 * relative, authenticated `src` becomes the bytes themselves, which is the only
 * form an application outside this app can resolve.
 */
export const buildRichClipboard = async (
	state: EditorState
): Promise<{ html: string; text: string }> => {
	const container = window.document.createElement('div');
	container.appendChild(
		DOMSerializer.fromSchema(state.schema).serializeFragment(state.selection.content().content)
	);

	let budget = MAX_INLINED_BYTES;
	const inline = async (element: Element, blob: Blob): Promise<Element | undefined> => {
		if (blob.size > budget) return undefined;
		const uri = await dataUri(blob);
		budget -= blob.size;
		const image = window.document.createElement('img');
		image.src = uri;
		const alt = element.getAttribute('alt');
		if (alt) image.alt = alt;
		return image;
	};

	const theme = activeMermaidTheme();
	const diagrams = Array.from(container.querySelectorAll('div[data-type="mermaid"]')).slice(
		0,
		MAX_INLINED_DIAGRAMS
	);
	for (const diagram of diagrams) {
		try {
			const source = diagram.textContent ?? '';
			if (!source.trim()) continue;
			const rendered = await inline(diagram, await mermaidPngBlob(source, theme));
			if (!rendered) continue;
			const width = diagram.getAttribute('data-width');
			if (width) rendered.setAttribute('style', `width: ${width}`);
			diagram.replaceWith(rendered);
		} catch {
			// A diagram that will not render keeps its source: one bad node must not
			// cost the rest of the copy.
		}
	}

	for (const image of Array.from(container.querySelectorAll('img'))) {
		const src = image.getAttribute('src');
		if (!src || src.startsWith('data:')) continue;
		try {
			const blob = await fetchSameOrigin(src);
			const rendered = blob && (await inline(image, blob));
			// Absolute at worst, so the markup stays well formed even when the bytes
			// were out of reach.
			if (rendered) image.replaceWith(rendered);
			else image.setAttribute('src', new URL(src, window.location.origin).href);
		} catch {
			image.setAttribute('src', new URL(src, window.location.origin).href);
		}
	}

	return { html: container.innerHTML, text: selectionPlainText(state) };
};

/**
 * A rejecting `ClipboardItem` value already surfaces through `write()`; this only keeps the
 * same rejection from being reported a second time as an unhandled one.
 */
const handled = <T>(promise: Promise<T>): Promise<T> => {
	promise.catch(() => {});
	return promise;
};

const blobOf = (value: string, type: string): Blob => new Blob([value], { type });

/**
 * The selection as a clipboard item, with the work left pending inside it.
 *
 * The promises matter: `navigator.clipboard.write` spends the keystroke's user activation
 * at the moment it is called, and rendering a diagram or fetching an attachment takes long
 * enough that awaiting first lets the activation lapse — the browser then rejects the write
 * and the copy looks like it simply did not happen until you press the shortcut again.
 * Handing `write` the unresolved blobs reaches it while the gesture is still live.
 */
export const selectionClipboardItem = (state: EditorState): ClipboardItem => {
	const lone = selectionMedia(state).lone;
	// A lone diagram or image becomes the whole clipboard: a bare PNG, which is what a chat
	// box or an image editor can take. Anything larger keeps its formatting and only swaps
	// the pictures in.
	if (lone?.kind === 'mermaid')
		return new ClipboardItem({
			'image/png': handled(mermaidPngBlob(lone.source, activeMermaidTheme())),
			'text/plain': blobOf(lone.source, 'text/plain')
		});
	if (lone?.kind === 'image')
		return new ClipboardItem({
			'image/png': handled(imagePngBlob(lone.src)),
			'text/plain': blobOf(lone.src, 'text/plain')
		});
	const payload = handled(buildRichClipboard(state));
	return new ClipboardItem({
		'text/html': handled(payload.then(({ html }) => blobOf(html, 'text/html'))),
		'text/plain': handled(payload.then(({ text }) => blobOf(text, 'text/plain')))
	});
};
