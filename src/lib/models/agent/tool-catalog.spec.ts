import { describe, expect, it } from 'vitest';
import {
	FIRST_CLASS_TOOL_NAMES,
	TOOL_CATALOG,
	TOOL_DESCRIPTIONS,
	toolDescription
} from './tool-catalog';

describe('tool catalog', () => {
	it('lists no duplicate tool names', () => {
		expect(new Set(TOOL_DESCRIPTIONS.map((entry) => entry.name)).size).toBe(
			TOOL_DESCRIPTIONS.length
		);
	});

	it('describes every first-class tool', () => {
		expect(
			FIRST_CLASS_TOOL_NAMES.every((name) =>
				TOOL_DESCRIPTIONS.some((entry) => entry.name === name)
			)
		).toBe(true);
	});

	it('keeps first-class tools out of the on-demand catalog', () => {
		expect(TOOL_CATALOG.every((entry) => !FIRST_CLASS_TOOL_NAMES.includes(entry.name))).toBe(true);
	});

	it('keeps every other tool in the on-demand catalog', () => {
		expect(TOOL_CATALOG.length).toBe(TOOL_DESCRIPTIONS.length - FIRST_CLASS_TOOL_NAMES.length);
	});

	it('resolves a description by name', () => {
		expect(toolDescription('get_note')).toBe(
			TOOL_DESCRIPTIONS.find((entry) => entry.name === 'get_note')!.description
		);
	});

	it('fails fast when a name drifts from the catalog', () => {
		expect(() => toolDescription('not_a_tool')).toThrow(
			'Tool description missing from catalog: not_a_tool'
		);
	});
});
