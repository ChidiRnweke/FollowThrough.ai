import { mount, unmount, type Component } from 'svelte';

/**
 * Node-view component props, open by design: this renderer mounts arbitrary
 * Tiptap node-view components, so the bag takes Svelte's own generic props
 * shape. Vendored editor code — the domain payload types model this app's
 * wire data, not DOM-attributable props.
 */
// audit-allow: no-record-unknown — Svelte mounts arbitrary components as open prop records by design.
export type RendererProps = Record<string, unknown>;

export interface SvelteRendererOptions {
	props?: RendererProps;
}

export class SvelteRenderer {
	private container: Element;

	private componentInstance: RendererProps | null = null;

	private component: Component<RendererProps>;

	private store = $state<RendererProps>({});

	destroyed = false;

	el: Element | null = null;

	constructor(component: Component<RendererProps>, { props = {} }: SvelteRendererOptions = {}) {
		this.component = component;
		this.container = document.createElement('div');
		Object.assign(this.store, props);
		this.mountComponent();
	}

	get element(): Element | null {
		return this.el;
	}

	get props(): RendererProps {
		return this.store;
	}

	get ref(): RendererProps | null {
		return this.componentInstance;
	}

	private mountComponent() {
		if (this.destroyed) {
			return;
		}

		this.componentInstance = mount(this.component, {
			target: this.container,
			props: this.store
		});

		this.el = this.container.firstElementChild as Element | null;
	}

	updateProps(props: RendererProps = {}): void {
		if (this.destroyed) {
			return;
		}

		Object.assign(this.store, props);
	}

	destroy(): void {
		if (this.destroyed) {
			return;
		}

		this.destroyed = true;

		if (this.componentInstance) {
			unmount(this.componentInstance);
			this.componentInstance = null;
		}

		this.el = null;
	}
}
