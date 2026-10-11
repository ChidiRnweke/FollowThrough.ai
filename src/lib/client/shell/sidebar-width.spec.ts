import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { describe, expect, it } from 'vitest';
import { parseSidebarWidth } from './sidebar-width';

describe('parseSidebarWidth', () => {
	it('falls back to the default when no cookie has been set', () => {
		expect(parseSidebarWidth(workspacePresentation, undefined)).toBe(256);
	});

	it('falls back to the default for a non-numeric cookie', () => {
		expect(parseSidebarWidth(workspacePresentation, 'wide-please')).toBe(256);
	});

	it('keeps a cookie inside the allowed range', () => {
		expect(parseSidebarWidth(workspacePresentation, '320')).toBe(320);
	});
});
