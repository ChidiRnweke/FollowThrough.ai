import type { Node } from '@tiptap/core';
import Image, { type ImageOptions } from '@tiptap/extension-image';

/**
 * Schema and Markdown behaviour for images, with no view layer attached.
 *
 * The editor's `ImageExtended.ts` attaches the node view. The server's Markdown
 * serializer needs only this schema, so nothing here may import Svelte.
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
