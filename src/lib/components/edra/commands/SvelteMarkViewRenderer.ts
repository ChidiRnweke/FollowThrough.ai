import type { MarkViewProps, MarkViewRenderer, MarkViewRendererOptions } from '@tiptap/core';
import { MarkView } from '@tiptap/core';
import type { Component } from 'svelte';

import MarkViewFrame from '../MarkViewFrame.svelte';
import { SvelteRenderer } from './SvelteRenderer.svelte.js';

export interface SvelteMarkViewRendererOptions extends MarkViewRendererOptions {
	as?: string;
	className?: string;
	attrs?: { [key: string]: string };
}

class SvelteMarkView extends MarkView<Component, SvelteMarkViewRendererOptions> {
	renderer: SvelteRenderer;

	constructor(
		component: Component,
		props: MarkViewProps,
		options?: Partial<SvelteMarkViewRendererOptions>
	) {
		super(component, props, options);

		const componentProps = {
			...props,
			updateAttributes: this.updateAttributes.bind(this)
		} satisfies MarkViewProps;

		this.renderer = new SvelteRenderer(MarkViewFrame as Component<Record<string, unknown>>, {
			props: {
				component: this.component,
				...componentProps
			}
		});
	}

	get dom() {
		return this.renderer.element as HTMLElement;
	}

	get contentDOM() {
		return this.dom.querySelector('[data-mark-view-content]') as HTMLElement | null;
	}

	destroy() {
		this.renderer.destroy();
	}
}

export function SvelteMarkViewRenderer(
	component: Component<MarkViewProps>,
	options: Partial<SvelteMarkViewRendererOptions> = {}
): MarkViewRenderer {
	return (props) => {
		return new SvelteMarkView(component as Component, props, options);
	};
}
