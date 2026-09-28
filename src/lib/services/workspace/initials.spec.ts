import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
	it('takes the first letter of the first and last words', () => {
		expect(initialsOf('Ada Lovelace')).toBe('AL');
	});

	it('skips middle names', () => {
		expect(initialsOf('Ada Byron Lovelace')).toBe('AL');
	});

	it('gives a single name its one initial', () => {
		expect(initialsOf('Architect')).toBe('A');
	});

	it('uppercases lowercase names', () => {
		expect(initialsOf('ada lovelace')).toBe('AL');
	});

	it('ignores surrounding and repeated whitespace', () => {
		expect(initialsOf('  Ada   Lovelace ')).toBe('AL');
	});

	it('keeps a leading character that spans two code units whole', () => {
		expect(initialsOf('𝒜da Lovelace')).toBe('𝒜L');
	});

	it('returns nothing for a blank name', () => {
		expect(initialsOf('   ')).toBe('');
	});
});
