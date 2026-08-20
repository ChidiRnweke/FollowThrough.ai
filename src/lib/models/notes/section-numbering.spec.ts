import { describe, expect, it } from 'vitest';
import {
	resolveSectionNumbering,
	sectionNumbersFor,
	sectionNumberingLevelFor,
	sectionNumberingOverrideFor,
	sectionNumberingView
} from './section-numbering';

describe('Resolving section numbering across note, project and app', () => {
	it('is off when nothing at any level is set', () => {
		expect(resolveSectionNumbering()).toBe(false);
	});

	it('follows the app default when neither note nor project set anything', () => {
		expect(resolveSectionNumbering(undefined, undefined, true)).toBe(true);
	});

	it('lets the project default beat the app default', () => {
		expect(resolveSectionNumbering(undefined, false, true)).toBe(false);
	});

	it('lets the note override beat the project default', () => {
		expect(resolveSectionNumbering(true, false, true)).toBe(true);
	});

	it('treats a note opting out as final', () => {
		expect(resolveSectionNumbering(false, true, true)).toBe(false);
	});
});

describe('The view the note workspace renders from', () => {
	it('reports what an inheriting note would fall back to', () => {
		expect(sectionNumberingView(undefined, true, false).inherited).toBe(true);
	});

	it('falls back to the app default when the project inherits too', () => {
		expect(sectionNumberingView(undefined, undefined, true).effective).toBe(true);
	});

	it('carries the note override so the menu can show it is pinned', () => {
		expect(sectionNumberingView(false, true, true).noteOverride).toBe(false);
	});
});

describe('Mapping between menu choices and stored overrides', () => {
	it('stores nothing for a note that defers to the default', () => {
		expect(sectionNumberingOverrideFor('default')).toBeUndefined();
	});

	it('shows a stored override as its explicit choice', () => {
		expect(sectionNumberingLevelFor(false)).toBe('off');
	});

	it('round-trips an unset override to the inherit choice', () => {
		expect(sectionNumberingLevelFor(sectionNumberingOverrideFor('default'))).toBe('default');
	});
});

describe('Numbering the headings the way the document draws them', () => {
	it('has nothing to number in a note without headings', () => {
		expect(sectionNumbersFor([])).toEqual([]);
	});

	it('counts a flat run of top-level headings', () => {
		expect(sectionNumbersFor([1, 1, 1])).toEqual(['1', '2', '3']);
	});

	it('numbers a subsection under its parent', () => {
		expect(sectionNumbersFor([1, 2, 2, 1, 2])).toEqual(['1', '1.1', '1.2', '2', '2.1']);
	});

	it('invents no phantom parent when the author skips a level', () => {
		expect(sectionNumbersFor([1, 3])).toEqual(['1', '1.1']);
	});

	it('starts at one for a note that opens below the top level', () => {
		expect(sectionNumbersFor([2, 2])).toEqual(['1', '2']);
	});

	it('continues a depth rather than repeating a number when the author comes back up', () => {
		expect(sectionNumbersFor([1, 3, 3, 2])).toEqual(['1', '1.1', '1.2', '1.3']);
	});

	it('restarts the subsection count under a new parent', () => {
		expect(sectionNumbersFor([1, 2, 1, 2])).toEqual(['1', '1.1', '2', '2.1']);
	});
});
