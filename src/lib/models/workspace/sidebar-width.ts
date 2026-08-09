/**
 * Sidebar width arithmetic, shared by the server (cookie parse on the shell load)
 * and the client (drag clamp in the app layout).
 *
 * The user's *preferred* width is what persists; what renders is the *effective*
 * width, which yields to whatever else is competing for the row — the docked
 * right panel and a split note pane. Because the preference is never overwritten
 * by the clamp, closing the panel or the split restores the width the user chose.
 */

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

function clampPreferred(width: number): number {
	if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT_PX;
	if (width < SIDEBAR_WIDTH_MIN_PX) return SIDEBAR_WIDTH_MIN_PX;
	if (width > SIDEBAR_WIDTH_MAX_PX) return SIDEBAR_WIDTH_MAX_PX;
	return Math.round(width);
}

/**
 * Reads the persisted width from its cookie, falling back to the default for a
 * missing or malformed value. Always returns a width inside the allowed range,
 * so a hand-edited cookie cannot render an unusable shell.
 */
export function parseSidebarWidth(cookie: string | undefined): number {
	if (cookie === undefined) return SIDEBAR_WIDTH_DEFAULT_PX;
	return clampPreferred(Number.parseFloat(cookie));
}

/**
 * The width to actually render: the preference, reduced by however much space
 * the content and a docked panel need. Never drops below `SIDEBAR_WIDTH_MIN_PX`
 * — a sidebar narrower than its icons is worse than a cramped editor, and the
 * shell already cues the user to collapse it entirely in that case.
 */
export function effectiveSidebarWidth(preferred: number, constraints: SidebarConstraints): number {
	const wanted = clampPreferred(preferred);
	if (constraints.viewportWidth <= 0) return wanted;

	const contentFloor = constraints.splitActive ? CONTENT_MIN_SPLIT_PX : CONTENT_MIN_PX;
	const reservedRight = constraints.panelDocked ? RIGHT_PANEL_WIDTH_PX : 0;
	const budget = constraints.viewportWidth - contentFloor - reservedRight - SHELL_CHROME_PX;

	if (budget < SIDEBAR_WIDTH_MIN_PX) return SIDEBAR_WIDTH_MIN_PX;
	return Math.min(wanted, Math.round(budget));
}
