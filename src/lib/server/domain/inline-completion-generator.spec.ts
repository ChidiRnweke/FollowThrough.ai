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
		expect(sanitizeCompletion('The migration', '```\nthe cutover window\n```')).toBe(
			' the cutover window'
		);
	});

	it('strips quotation marks wrapping the whole continuation', () => {
		expect(sanitizeCompletion('The migration', '"the cutover window"')).toBe(' the cutover window');
	});

	it('removes a leading repeat of the text before the caret', () => {
		expect(sanitizeCompletion('We should account for', ' account for the replica lag')).toBe(
			' the replica lag'
		);
	});

	it('drops a completion that only restates recent text', () => {
		expect(sanitizeCompletion('The cutover window is short.', 'The cutover window is short.')).toBe(
			''
		);
	});

	it('joins to the caret with a single space when the prefix ends mid-word', () => {
		expect(sanitizeCompletion('We need', 'more replicas.')).toBe(' more replicas.');
	});

	it('adds no space when the prefix already ends with whitespace', () => {
		expect(sanitizeCompletion('We need ', 'more replicas.')).toBe('more replicas.');
	});

	it('joins punctuation continuations without a space', () => {
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
