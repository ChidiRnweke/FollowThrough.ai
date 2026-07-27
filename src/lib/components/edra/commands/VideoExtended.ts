import { Video } from './Video.js';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';
import type { Component } from 'svelte';
import type { NodeViewProps } from '@tiptap/core';

/** Schema and Markdown behaviour, shared with the server serializer. See `nodes.ts`. */
export const VideoNode = Video.extend({
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
});

export const VideoExtended = (component: Component<NodeViewProps>) =>
	VideoNode.extend({
		addNodeView: () => SvelteNodeViewRenderer(component)
	});
