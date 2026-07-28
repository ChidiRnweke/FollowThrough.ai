import type { Node } from '@tiptap/core';
import Image, { type ImageOptions } from '@tiptap/extension-image';

/**
 * Schema and Markdown behaviour for images, with no view layer attached.
 *
 * Kept apart from `ImageExtended.ts` on purpose: the server's Markdown
 * serializer needs this schema, and anything it imports ends up in the server
 * bundle. Pairing it with the node-view factory would drag Svelte — and through
 * it `$app/*` — into code that never renders anything. See `nodes.ts`.
 */
export const ImageNode: Node<ImageOptions, unknown> = Image.extend({
	addAttributes() {
		return {
			src: { default: null },
			alt: { default: null },
			title: { default: null },
			width: { default: '100%' },
			height: { default: null },
			align: { default: 'left' }
		};
	}
}).configure({ allowBase64: false });
