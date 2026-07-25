import { MediaQuery } from 'svelte/reactivity';

/**
 * The global guard in `layout.css` neutralises CSS transitions and animations,
 * but Svelte's JS transitions run outside it — a `fly` still flies. Components
 * that use `transition:` must read this and pick a fade instead.
 */
export class PrefersReducedMotion extends MediaQuery {
	constructor() {
		super('prefers-reduced-motion: reduce');
	}
}
