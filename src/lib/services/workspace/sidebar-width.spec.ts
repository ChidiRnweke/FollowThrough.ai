import { describe, expect, it } from 'vitest';
import type { SidebarConstraints } from '$lib/models/workspace';
import { SidebarSizingService } from '$lib/services/workspace/sidebar-width';

// Today's geometry, in pixels: the sidebar may be 192 to 448 wide; the rail (56) and shell
// chrome (32) are always on screen; the editor needs 480 (768 while split); a docked panel
// takes 384.
const { clampPreferred, effectiveSidebarWidth } = new SidebarSizingService();

const roomy: SidebarConstraints = {
	viewportWidth: 2560,
	panelDocked: false,
	splitActive: false
};

describe('clampPreferred', () => {
	it.each([
		[191, 192],
		[192, 192],
		[300.4, 300],
		[448, 448],
		[449, 448],
		[Number.NaN, 256]
	])('turns a preference of %s into %s', (preferred, expected) => {
		expect(clampPreferred(preferred)).toBe(expected);
	});
});

describe('effectiveSidebarWidth', () => {
	it('grants the full preference when the viewport has room to spare', () => {
		expect(effectiveSidebarWidth(400, roomy)).toBe(400);
	});

	it('returns the clamped preference when the viewport is not yet known', () => {
		expect(effectiveSidebarWidth(9000, { ...roomy, viewportWidth: 0 })).toBe(448);
	});

	it.each([
		[1399, 447],
		[1400, 448],
		[1401, 448]
	])('with the panel docked in a %s px viewport, shows %s px', (viewportWidth, expected) => {
		expect(effectiveSidebarWidth(448, { ...roomy, viewportWidth, panelDocked: true })).toBe(
			expected
		);
	});

	it('leaves the sidebar alone when the panel is open but rendering as a sheet', () => {
		expect(effectiveSidebarWidth(448, { ...roomy, viewportWidth: 1399, panelDocked: false })).toBe(
			448
		);
	});

	it.each([
		[1200, 344],
		[1303, 447],
		[1304, 448]
	])('while split in a %s px viewport, shows %s px', (viewportWidth, expected) => {
		expect(effectiveSidebarWidth(448, { ...roomy, viewportWidth, splitActive: true })).toBe(
			expected
		);
	});

	it.each([
		[1431, 192],
		[1433, 193],
		[1432, 192],
		[900, 192]
	])(
		'never narrows past 192 px: docked and split in a %s px viewport shows %s',
		(viewportWidth, expected) => {
			expect(
				effectiveSidebarWidth(448, { viewportWidth, panelDocked: true, splitActive: true })
			).toBe(expected);
		}
	);

	it('restores the untouched preference once the constraint lifts', () => {
		effectiveSidebarWidth(448, { ...roomy, viewportWidth: 1200, splitActive: true });
		expect(effectiveSidebarWidth(448, { ...roomy, viewportWidth: 1200 })).toBe(448);
	});
});
