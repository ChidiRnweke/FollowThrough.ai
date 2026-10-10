import { describe, expect, it } from 'vitest';
import { AccountPresentationService } from '$lib/services/workspace/initials';
const { initialsOf } = new AccountPresentationService();

describe('initialsOf', () => {
	it('takes the first letter of the first and last words', () => {
		expect(initialsOf('  ada byron   lovelace ')).toBe('AL');
	});

	it('gives a single name its one initial', () => {
		expect(initialsOf('Architect')).toBe('A');
	});

	it('keeps a leading character that spans two code units whole', () => {
		expect(initialsOf('𝒜da Lovelace')).toBe('𝒜L');
	});

	it('returns nothing for a blank name', () => {
		expect(initialsOf('   ')).toBe('');
	});
});
