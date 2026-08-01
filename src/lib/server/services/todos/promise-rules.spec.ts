import { describe, expect, it } from 'vitest';
import type { NoteId, TextSelection } from '$lib/models/notes';
import { parsePromises } from './promise-rules';

const selection = (text: string): TextSelection => ({
	noteId: '00000000-0000-4000-8000-000000000001' as NoteId,
	revision: 1,
	from: 0,
	to: text.length,
	text
});
const baseDate = new Date('2026-07-11T09:00:00.000Z');

describe('parsePromises', () => {
	it('separates the action from a direct commitment', () => {
		expect(parsePromises(selection('I will send the design.'))[0]?.action).toBe('Send the design');
	});
	it('classifies a direct commitment as mine', () => {
		expect(parsePromises(selection('I will send the design.'))[0]?.responsibility).toBe('mine');
	});
	it('classifies will language as explicit', () => {
		expect(parsePromises(selection('I will send the design.'))[0]?.strength).toBe('explicit');
	});
	it('classifies commitments made by others', () => {
		expect(parsePromises(selection('Jan will send the API spec.'))[0]?.responsibility).toBe(
			'waiting_on'
		);
	});
	it('preserves relative due-date wording', () => {
		expect(parsePromises(selection('I will send it tomorrow.'))[0]?.dueDateVerbatim).toBe(
			'tomorrow'
		);
	});
	it('resolves a relative due date', () => {
		expect(parsePromises(selection('I will send it tomorrow.'), baseDate)[0]?.resolvedDueDate).toBe(
			'2026-07-12'
		);
	});
	it('does not extract a question', () => {
		expect(parsePromises(selection('Should I send it?'))).toEqual([]);
	});
	it('does not extract a floated option', () => {
		expect(parsePromises(selection('We could wait.'))).toEqual([]);
	});
});
