import { describe, it, expect } from 'vitest';
import { readToolFailure, toolFailure } from './tool-failure';

describe('canonical tool failure', () => {
	it('recognizes a failure independently of key order', () => {
		expect(
			readToolFailure(
				JSON.stringify({
					details: {},
					recovery: 'Read it again.',
					message: 'Changed',
					code: 'CONFLICT',
					kind: 'failure'
				})
			)
		).toBe('Changed');
	});
	it('rejects a corrupt failure instead of classifying it as success', () => {
		expect(() => readToolFailure({ kind: 'failure', message: 'Changed' })).toThrow();
	});
	it('leaves successful domain states unchanged', () => {
		expect(readToolFailure({ kind: 'no_matches', matches: [] })).toBeUndefined();
	});
	it('retains structured recovery details', () => {
		expect(
			toolFailure('VALIDATION', 'Invalid edit', 'Correct it.', { problems: ['Missing oldText'] })
		).toEqual({
			kind: 'failure',
			code: 'VALIDATION',
			message: 'Invalid edit',
			recovery: 'Correct it.',
			details: { problems: ['Missing oldText'] }
		});
	});
});
