import { describe, expect, it } from 'vitest';
import {
	CONTENT_MIN_PX,
	CONTENT_MIN_SPLIT_PX,
	RIGHT_PANEL_WIDTH_PX,
	SHELL_CHROME_PX,
	SIDEBAR_WIDTH_DEFAULT_PX,
	SIDEBAR_WIDTH_MAX_PX,
	SIDEBAR_WIDTH_MIN_PX,
	effectiveSidebarWidth,
	parseSidebarWidth,
	type SidebarConstraints
} from './sidebar-width';

const roomy: SidebarConstraints = {
	viewportWidth: 2560,
	panelDocked: false,
	splitActive: false
};

describe('parseSidebarWidth', () => {
	it('falls back to the default when no cookie has been set', () => {
		expect(parseSidebarWidth(undefined)).toBe(SIDEBAR_WIDTH_DEFAULT_PX);
	});

	it('falls back to the default for a non-numeric cookie', () => {
		expect(parseSidebarWidth('wide-please')).toBe(SIDEBAR_WIDTH_DEFAULT_PX);
	});

	it('raises a cookie below the minimum to the minimum', () => {
		expect(parseSidebarWidth('40')).toBe(SIDEBAR_WIDTH_MIN_PX);
	});

	it('lowers a cookie above the maximum to the maximum', () => {
		expect(parseSidebarWidth('9000')).toBe(SIDEBAR_WIDTH_MAX_PX);
	});

	it('keeps a cookie inside the allowed range', () => {
		expect(parseSidebarWidth('320')).toBe(320);
	});
});

describe('effectiveSidebarWidth', () => {
	it('grants the full preference when the viewport has room to spare', () => {
		expect(effectiveSidebarWidth(400, roomy)).toBe(400);
	});

	it('returns the clamped preference when the viewport is not yet known', () => {
		expect(effectiveSidebarWidth(9000, { ...roomy, viewportWidth: 0 })).toBe(SIDEBAR_WIDTH_MAX_PX);
	});

	it('reserves the docked panel width, narrowing the sidebar', () => {
		const viewportWidth = SIDEBAR_WIDTH_MAX_PX + CONTENT_MIN_PX + RIGHT_PANEL_WIDTH_PX;
		expect(
			effectiveSidebarWidth(SIDEBAR_WIDTH_MAX_PX, { ...roomy, viewportWidth, panelDocked: true })
		).toBe(SIDEBAR_WIDTH_MAX_PX - SHELL_CHROME_PX);
	});

	it('leaves the sidebar alone when the panel is open but rendering as a sheet', () => {
		const viewportWidth = SIDEBAR_WIDTH_MAX_PX + CONTENT_MIN_PX + RIGHT_PANEL_WIDTH_PX;
		expect(
			effectiveSidebarWidth(SIDEBAR_WIDTH_MAX_PX, { ...roomy, viewportWidth, panelDocked: false })
		).toBe(SIDEBAR_WIDTH_MAX_PX);
	});

	it('reserves the wider content floor while a split is active', () => {
		const viewportWidth = 1200;
		expect(
			effectiveSidebarWidth(SIDEBAR_WIDTH_MAX_PX, { ...roomy, viewportWidth, splitActive: true })
		).toBe(viewportWidth - CONTENT_MIN_SPLIT_PX - SHELL_CHROME_PX);
	});

	it('never narrows past the minimum, however tight the viewport', () => {
		expect(
			effectiveSidebarWidth(SIDEBAR_WIDTH_MAX_PX, {
				viewportWidth: 900,
				panelDocked: true,
				splitActive: true
			})
		).toBe(SIDEBAR_WIDTH_MIN_PX);
	});

	it('restores the untouched preference once the constraint lifts', () => {
		const preferred = SIDEBAR_WIDTH_MAX_PX;
		const viewportWidth = 1200;
		effectiveSidebarWidth(preferred, { ...roomy, viewportWidth, splitActive: true });
		expect(effectiveSidebarWidth(preferred, { ...roomy, viewportWidth })).toBe(preferred);
	});
});
