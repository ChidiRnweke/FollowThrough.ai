/** Sidebar width values and the space constraints supplied by the app shell. */

/** Below this the sidebar is narrower than its own labels are readable. */
export const SIDEBAR_WIDTH_MIN_PX = 192; // 12rem
/** The historical fixed width, and the double-click reset target. */
export const SIDEBAR_WIDTH_DEFAULT_PX = 256; // 16rem
export const SIDEBAR_WIDTH_MAX_PX = 448; // 28rem

/** Mirrors the `w-96` on the right panel's aside; kept here so the clamp can reserve it. */
export const RIGHT_PANEL_WIDTH_PX = 384; // 24rem

/** Comfortable minimum for a single note pane before the sidebar must stop growing. */
export const CONTENT_MIN_PX = 480; // 30rem
/**
 * The container width at which `.workspace-panes` falls back to showing one pane
 * at a time (`47.999rem` in layout.css). Reserving it keeps a widened sidebar from
 * silently collapsing an active split into the narrow switcher.
 */
export const CONTENT_MIN_SPLIT_PX = 768; // 48rem

/** Slack for the inset's `m-2` and the sidebar container's `p-2`. */
export const SHELL_CHROME_PX = 32; // 2rem

export interface SidebarConstraints {
	/** Live viewport width; `0` when unknown (SSR, before hydration). */
	readonly viewportWidth: number;
	/** The right panel is open *and* docked beside the content rather than a sheet. */
	readonly panelDocked: boolean;
	/** A second note pane is on screen. */
	readonly splitActive: boolean;
}
