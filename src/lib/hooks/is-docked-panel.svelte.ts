import { MediaQuery } from 'svelte/reactivity';

/**
 * Width at which there is room for the right panel to sit *beside* the content
 * instead of covering it. Below this the panel becomes a modal sheet; above it
 * the panel docks and the rest of the app stays usable, so no scrim is drawn.
 */
export const DOCKED_PANEL_BREAKPOINT = '96rem';

const DOCKED_PANEL_QUERY = `min-width: ${DOCKED_PANEL_BREAKPOINT}`;

export class IsDockedPanel extends MediaQuery {
	constructor() {
		super(DOCKED_PANEL_QUERY);
	}
}

/** Non-reactive check, for one-shot decisions outside of a component. */
export const dockedPanelFits = (): boolean =>
	typeof window !== 'undefined' && window.matchMedia(`(${DOCKED_PANEL_QUERY})`).matches;
