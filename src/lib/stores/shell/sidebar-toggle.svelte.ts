/**
 * A palette-reachable handle on the sidebar.
 *
 * The sidebar's own state lives in a Svelte context, which the command registry — a
 * plain module — cannot read. The app shell registers the toggle here on mount so
 * "Toggle sidebar" can appear in the palette alongside every other command, which is
 * how someone with Ctrl+B muscle memory discovers the binding moved.
 */
class SidebarToggleStore {
	#toggle: (() => void) | undefined;

	register(toggle: () => void): () => void {
		this.#toggle = toggle;
		return () => {
			if (this.#toggle === toggle) this.#toggle = undefined;
		};
	}

	toggle(): void {
		this.#toggle?.();
	}
}

export const sidebarToggle = new SidebarToggleStore();
