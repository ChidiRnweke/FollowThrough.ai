import type { Node, NodeViewProps } from '@tiptap/core';
import type { ImageOptions } from '@tiptap/extension-image';
import { ImageNode } from '$lib/infrastructure/notes/schema/image';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';
import type { Component } from 'svelte';

export { ImageNode };

export const ImageExtended = (component: Component<NodeViewProps>): Node<ImageOptions, unknown> =>
	ImageNode.extend({
		addNodeView: () => SvelteNodeViewRenderer(component)
	});
