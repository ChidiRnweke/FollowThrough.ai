import { VideoNode } from '$lib/infrastructure/notes/schema/video';
import { SvelteNodeViewRenderer } from './SvelteNodeViewRenderer.js';
import type { Component } from 'svelte';
import type { NodeViewProps } from '@tiptap/core';

export { VideoNode };

export const VideoExtended = (component: Component<NodeViewProps>) =>
	VideoNode.extend({
		addNodeView: () => SvelteNodeViewRenderer(component)
	});
