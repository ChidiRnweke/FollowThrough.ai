import { describe, it, expect } from 'vitest';
import { levenshtein, matchToolName } from './tool-name-matcher';

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
