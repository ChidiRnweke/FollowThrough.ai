import { describe, it, expect } from 'vitest';
import { sanitizeCompletion } from './inline-completion-generator';

describe('sanitizeCompletion', () => {
	it('returns empty text for an empty completion', () => {
		expect(sanitizeCompletion('The migration should account for', '')).toBe('');
	});

	it('returns empty text for a whitespace-only completion', () => {
		expect(sanitizeCompletion('The migration should account for', '   \n ')).toBe('');
	});

	it('strips a markdown fence wrapping the continuation', () => {
		expect(sanitizeCompletion('The migration', '```\n handles the cutover\n```')).toBe(
			' handles the cutover'
		);
	});

	it('strips quotation marks wrapping the whole continuation', () => {
		expect(sanitizeCompletion('The migration', '" handles the cutover"')).toBe(
			' handles the cutover'
		);
	});

	it('removes a leading repeat of the text before the caret', () => {
		expect(sanitizeCompletion('We should account for', ' account for the replica lag')).toBe(
			' the replica lag'
		);
	});

	it('drops a completion that restates the text immediately before the caret', () => {
		expect(sanitizeCompletion('The cutover window is short.', 'The cutover window is short.')).toBe(
			''
		);
	});

	it('keeps a continuation that incidentally repeats an earlier word', () => {
		expect(
			sanitizeCompletion(
				'The cutover was risky, so we rehearsed it.',
				' The cutover went smoothly.'
			)
		).toBe(' The cutover went smoothly.');
	});

	it('completes a partial word with no injected space', () => {
		expect(sanitizeCompletion('The migrat', 'ion scales.')).toBe('ion scales.');
	});

	it("passes through the model's leading space at a word boundary", () => {
		expect(sanitizeCompletion('We need', ' more replicas.')).toBe(' more replicas.');
	});

	it('collapses a double space at the seam when the prefix ends with whitespace', () => {
		expect(sanitizeCompletion('We need ', ' more replicas.')).toBe('more replicas.');
	});

	it('leaves a punctuation continuation exactly as written', () => {
		expect(sanitizeCompletion('We need more replicas', ', as Ana noted.')).toBe(', as Ana noted.');
	});

	it('keeps at most two sentences', () => {
		expect(sanitizeCompletion('Notes:', ' One. Two. Three.')).toBe(' One. Two.');
	});

	it('does not treat a decimal point as a sentence boundary', () => {
		expect(sanitizeCompletion('Latency was', ' 1.5 seconds. Then it recovered.')).toBe(
			' 1.5 seconds. Then it recovered.'
		);
	});
});
