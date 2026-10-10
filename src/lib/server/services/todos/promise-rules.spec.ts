import { describe, expect, it } from 'vitest';
import type { NoteId, TextSelection } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { DeterministicPromiseExtractor } from './promise-rules';
const rules = new DeterministicPromiseExtractor();
const selection = (text: string): TextSelection => ({
	noteId: '00000000-0000-4000-8000-000000000001' as NoteId,
	revision: 1,
	from: 0,
	to: text.length,
	text
});
const requestedAt = '2026-07-11T09:00:00.000Z' as DateTime;
const extract = (text: string) => rules.extract(testActor(), selection(text), requestedAt);

describe('deterministic commitment extraction', () => {
	it('separates the action and owner of a direct commitment', async () => {
		expect(await extract('I will send the design.')).toEqual([
			{
				action: 'Send the design',
				ownerName: 'I',
				responsibility: 'mine',
				strength: 'explicit',
				confidence: 95
			}
		]);
	});
	it('classifies commitments made by others', async () => {
		expect((await extract('Jan will send the API spec.'))[0]?.responsibility).toBe('waiting_on');
	});
	it('preserves the due-date wording and resolves tomorrow from the requested date', async () => {
		expect(await extract('I will send it tomorrow.')).toEqual([
			{
				action: 'Send it',
				ownerName: 'I',
				responsibility: 'mine',
				dueDateVerbatim: 'tomorrow',
				resolvedDueDate: '2026-07-12',
				strength: 'explicit',
				confidence: 95
			}
		]);
	});
	it('does not extract a question', async () => {
		expect(await extract('Should I send it?')).toEqual([]);
	});
	it('does not extract a floated option', async () => {
		expect(await extract('We could wait.')).toEqual([]);
	});
	it('selects other people’s commitments without changing their extracted facts', async () => {
		const candidates = await extract('I will send the design. Jan will send the API spec.');
		expect(rules.select(candidates, 'waiting_on')).toEqual([
			{
				action: 'Send the API spec',
				ownerName: 'Jan',
				responsibility: 'waiting_on',
				strength: 'explicit',
				confidence: 95
			}
		]);
	});
});
