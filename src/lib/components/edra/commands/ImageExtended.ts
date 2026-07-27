import type { Node, NodeViewProps } from '@tiptap/core';
import Image, { type ImageOptions } from '@tiptap/extension-image';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';
import type { Component } from 'svelte';

/** Schema and Markdown behaviour, shared with the server serializer. See `nodes.ts`. */
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

export const ImageExtended = (component: Component<NodeViewProps>): Node<ImageOptions, unknown> =>
	ImageNode.extend({
		addNodeView: () => SvelteNodeViewRenderer(component)
	});
