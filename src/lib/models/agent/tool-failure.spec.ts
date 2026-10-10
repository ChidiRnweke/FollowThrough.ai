import { describe, it, expect } from 'vitest';
import { readToolOutput, toolFailure } from './tool-failure';

describe('canonical tool failure', () => {
	it('recognizes a failure independently of key order', () => {
		const reading = readToolOutput(
			JSON.stringify({
				details: {},
				recovery: 'Read it again.',
				message: 'Changed',
				code: 'CONFLICT',
				kind: 'failure'
			})
		);
		expect(reading.kind === 'failure' && reading.failure.message).toBe('Changed');
	});
	it('reports a corrupt failure instead of classifying it as success', () => {
		expect(readToolOutput({ kind: 'failure', message: 'Changed' }).kind).toBe('corrupt');
	});
	it('leaves successful domain states unchanged', () => {
		expect(readToolOutput({ kind: 'no_matches', matches: [] }).kind).toBe('success');
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
