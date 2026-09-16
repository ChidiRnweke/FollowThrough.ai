import { describe, expect, it } from 'vitest';
import {
	SIDEBAR_WIDTH_DEFAULT_PX,
	SIDEBAR_WIDTH_MIN_PX,
	SIDEBAR_WIDTH_MAX_PX
} from '$lib/models/workspace';
import { parseSidebarWidth } from './sidebar-width';

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
