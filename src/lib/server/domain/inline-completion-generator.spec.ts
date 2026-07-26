import { describe, it, expect } from 'vitest';
import type { InlineCompletionContext, InlineSuggestionRequest, NoteId } from '$lib/models';
import { SemanticConventions } from '@arizeai/openinference-semantic-conventions';
import {
	inlineCompletionPrompt,
	inlineCompletionTraceAttributes,
	sanitizeCompletion
} from './inline-completion-generator';

const request: InlineSuggestionRequest = {
	requestId: '00000000-0000-4000-8000-000000000001',
	noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
	revision: 1,
	headingPath: [],
	blockType: 'paragraph',
	currentSection: 'There is a totally unrelated document about',
	prefix: 'There is a totally unrelated document about',
	suffix: ''
};

const context: InlineCompletionContext = {
	noteTitle: 'Current note',
	noteText: 'The full note text.',
	userMemory: ['The user prefers concise prose.'],
	projectPassages: [
		{
			sourceTitle: 'The Odyssey',
			sourceType: 'note',
			content: 'An epic poem attributed to Homer.'
		}
	]
};

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

describe('inline completion grounding', () => {
	it('includes source titles in the completion prompt', () => {
		expect(inlineCompletionPrompt(request, context)).toContain('The Odyssey');
	});

	it('includes retrieved content in the completion prompt', () => {
		expect(inlineCompletionPrompt(request, context)).toContain('An epic poem attributed to Homer.');
	});

	it('includes the authoritative note text in the completion prompt', () => {
		expect(inlineCompletionPrompt(request, context)).toContain('The full note text.');
	});

	it('includes user memory in the completion prompt', () => {
		expect(inlineCompletionPrompt(request, context)).toContain('The user prefers concise prose.');
	});
});

describe('inline completion telemetry', () => {
	const attributes = inlineCompletionTraceAttributes('Continue this', {
		text: ' thought.',
		raw: ' thought.',
		model: 'deepseek/deepseek-v4-flash',
		finishReason: 'stop',
		refused: false,
		usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 }
	});

	it('records the model', () => {
		expect(attributes[SemanticConventions.LLM_MODEL_NAME]).toBe('deepseek/deepseek-v4-flash');
	});

	it('records prompt tokens', () => {
		expect(attributes[SemanticConventions.LLM_TOKEN_COUNT_PROMPT]).toBe(20);
	});

	it('records completion tokens', () => {
		expect(attributes[SemanticConventions.LLM_TOKEN_COUNT_COMPLETION]).toBe(3);
	});

	it('records total tokens', () => {
		expect(attributes[SemanticConventions.LLM_TOKEN_COUNT_TOTAL]).toBe(23);
	});

	it('records the finish reason', () => {
		expect(attributes[SemanticConventions.LLM_FINISH_REASON]).toBe('stop');
	});
});
