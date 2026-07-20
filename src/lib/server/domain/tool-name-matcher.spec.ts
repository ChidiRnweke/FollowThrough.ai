import { describe, it, expect } from 'vitest';
import { levenshtein, matchToolName, suggestToolNames } from './tool-name-matcher';

const names = ['search', 'create_project', 'get_workspace_context', 'list_projects'];

describe('levenshtein', () => {
	it('is zero for identical strings', () => {
		expect(levenshtein('search', 'search')).toBe(0);
	});

	it('counts single-character edits', () => {
		expect(levenshtein('serch', 'search')).toBe(1);
	});
});

describe('matchToolName', () => {
	it('resolves an exact name', () => {
		expect(matchToolName('search', names)).toEqual({ kind: 'exact', name: 'search' });
	});

	it('suggests the nearest name for a close typo', () => {
		expect(matchToolName('serch', names)).toEqual({ kind: 'suggestion', name: 'search' });
	});

	it('returns none when nothing is within the threshold', () => {
		expect(matchToolName('completely_different_xyz', names)).toEqual({ kind: 'none' });
	});
});

describe('suggestToolNames', () => {
	it('returns every name inside the edit-distance threshold nearest first', () => {
		expect(suggestToolNames('save_nte', ['save_note', 'save_notes', 'create_note'])).toEqual([
			{ name: 'save_note', distance: 1 },
			{ name: 'save_notes', distance: 2 }
		]);
	});

	it('sorts equal-distance suggestions by name', () => {
		expect(suggestToolNames('bat', ['cat', 'hat'])).toEqual([
			{ name: 'cat', distance: 1 },
			{ name: 'hat', distance: 1 }
		]);
	});

	it('includes suggestions exactly at the threshold', () => {
		expect(suggestToolNames('abc', ['abcdef'], 3)).toEqual([{ name: 'abcdef', distance: 3 }]);
	});

	it('deduplicates candidate names', () => {
		expect(suggestToolNames('serch', ['search', 'search'])).toEqual([
			{ name: 'search', distance: 1 }
		]);
	});

	it('returns no suggestions outside the threshold', () => {
		expect(suggestToolNames('abc', ['completely_different'], 3)).toEqual([]);
	});
});
