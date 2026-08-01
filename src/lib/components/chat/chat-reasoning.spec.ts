import { describe, expect, it } from 'vitest';
import { parseReasoning, reasoningTitle } from './chat-reasoning';

describe('Reasoning is split into the thoughts the model wrote', () => {
	it('keeps untitled reasoning as a single section', () => {
		expect(parseReasoning('The user wants a diagram.')).toEqual([
			{ body: 'The user wants a diagram.' }
		]);
	});

	it('separates a bold heading from the thought under it', () => {
		expect(parseReasoning('**Reading the note**\nIt has three sections.')).toEqual([
			{ title: 'Reading the note', body: 'It has three sections.' }
		]);
	});

	it('splits every heading into its own section', () => {
		expect(parseReasoning('**First**\nOne.\n\n**Second**\nTwo.')).toEqual([
			{ title: 'First', body: 'One.' },
			{ title: 'Second', body: 'Two.' }
		]);
	});

	it('keeps text written before the first heading', () => {
		expect(parseReasoning('Warming up.\n\n**Plan**\nDo it.')).toEqual([
			{ body: 'Warming up.' },
			{ title: 'Plan', body: 'Do it.' }
		]);
	});

	it('detaches a heading that runs into its own paragraph', () => {
		expect(parseReasoning('**Plan** first I check the tree.')).toEqual([
			{ title: 'Plan', body: 'first I check the tree.' }
		]);
	});

	it('reads a markdown heading as a title too', () => {
		expect(parseReasoning('## Checking\nAll good.')).toEqual([
			{ title: 'Checking', body: 'All good.' }
		]);
	});

	it('leaves a half-streamed heading as text rather than guessing at it', () => {
		expect(parseReasoning('**Weigh')).toEqual([{ body: '**Weigh' }]);
	});

	it('has nothing to show for empty reasoning', () => {
		expect(parseReasoning('')).toEqual([]);
	});
});

describe('The collapsed row says what the model is thinking about', () => {
	it('shows the latest heading, so it tracks the live thought', () => {
		expect(reasoningTitle(parseReasoning('**First**\nOne.\n\n**Second**\nTwo.'))).toBe('Second');
	});

	it('falls back to the opening sentence when the model wrote no heading', () => {
		expect(reasoningTitle(parseReasoning('The user wants a diagram. Then I will save it.'))).toBe(
			'The user wants a diagram'
		);
	});

	it('truncates a sentence too long to sit in a one-line row (1/2)', () => {
		const title = reasoningTitle(parseReasoning('a'.repeat(200)));
		expect(title.length).toBeLessThanOrEqual(61);
	});

	it('truncates a sentence too long to sit in a one-line row (2/2)', () => {
		const title = reasoningTitle(parseReasoning('a'.repeat(200)));
		expect(title.endsWith('…')).toBe(true);
	});

	it('says "Reasoning" when there is nothing to name it by', () => {
		expect(reasoningTitle(parseReasoning(''))).toBe('Reasoning');
	});
});
