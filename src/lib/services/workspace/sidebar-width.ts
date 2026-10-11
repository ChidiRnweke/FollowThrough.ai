import {
	SIDEBAR_WIDTH_DEFAULT_PX,
	SIDEBAR_WIDTH_MIN_PX,
	SIDEBAR_WIDTH_MAX_PX,
	CONTENT_MIN_PX,
	CONTENT_MIN_SPLIT_PX,
	RIGHT_PANEL_WIDTH_PX,
	SHELL_CHROME_PX,
	SIDEBAR_RAIL_PX,
	type SidebarConstraints
} from '$lib/models/workspace';

function clampPreferred(width: number): number {
	if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT_PX;
	if (width < SIDEBAR_WIDTH_MIN_PX) return SIDEBAR_WIDTH_MIN_PX;
	if (width > SIDEBAR_WIDTH_MAX_PX) return SIDEBAR_WIDTH_MAX_PX;
	return Math.round(width);
}

/**
 * The panel width to actually render: the preference, reduced by however much
 * space the rail, the content and a docked panel need. Never drops below `SIDEBAR_WIDTH_MIN_PX`
 * — a sidebar narrower than its icons is worse than a cramped editor, and the
 * shell already cues the user to collapse it entirely in that case.
 */
function effectiveSidebarWidth(preferred: number, constraints: SidebarConstraints): number {
	const wanted = clampPreferred(preferred);
	if (constraints.viewportWidth <= 0) return wanted;

	const contentFloor = constraints.splitActive ? CONTENT_MIN_SPLIT_PX : CONTENT_MIN_PX;
	const reservedRight = constraints.panelDocked ? RIGHT_PANEL_WIDTH_PX : 0;
	const budget =
		constraints.viewportWidth - contentFloor - reservedRight - SIDEBAR_RAIL_PX - SHELL_CHROME_PX;

	if (budget < SIDEBAR_WIDTH_MIN_PX) return SIDEBAR_WIDTH_MIN_PX;
	return Math.min(wanted, Math.round(budget));
}

export interface SidebarSizing {
	clampPreferred(width: number): number;
	effectiveSidebarWidth(preferred: number, constraints: SidebarConstraints): number;
}
export class SidebarSizingService implements SidebarSizing {
	clampPreferred(width: number): number {
		return clampPreferred(width);
	}
	effectiveSidebarWidth(preferred: number, constraints: SidebarConstraints): number {
		return effectiveSidebarWidth(preferred, constraints);
	}
}
