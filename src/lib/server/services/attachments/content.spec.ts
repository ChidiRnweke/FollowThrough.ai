import { describe, expect, it } from 'vitest';
import { view } from '$lib/testing/attachments/fakes/processing';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { AttachmentProcessingService } from './content';

const rules = new AttachmentProcessingService();
const queued = view('application/pdf').version;

describe('attachment processing rules', () => {
	it('treats queued and interrupted versions as pending', () => {
		expect([
			rules.pending(queued),
			rules.pending({ ...queued, processingStatus: 'processing' }),
			rules.pending({ ...queued, processingStatus: 'ready' })
		]).toEqual([true, true, false]);
	});

	it('reuses a historically truncated extraction instead of extracting again', () => {
		const truncated = {
			...queued,
			processingStatus: 'partial' as const,
			extractedText: 'Saved text',
			parserKind: 'text'
		};
		expect({ pending: rules.pending(truncated), saved: rules.saved(truncated) }).toEqual({
			pending: true,
			saved: { text: 'Saved text', parserKind: 'text' }
		});
	});

	it('does not reuse a partial extraction that recorded a failure', () => {
		expect(
			rules.saved({
				...queued,
				processingStatus: 'partial',
				processingFailure: 'Vision unavailable',
				extractedText: 'Saved text',
				parserKind: 'ocr'
			})
		).toBeUndefined();
	});

	it.each([
		{ name: 'no extraction', extraction: undefined, status: 'unsupported' },
		{
			name: 'a complete extraction',
			extraction: { text: 'Text', parserKind: 'text' },
			status: 'ready'
		},
		{
			name: 'an extraction with a failure',
			extraction: { text: 'Text', parserKind: 'ocr', processingFailure: 'Vision unavailable' },
			status: 'partial'
		}
	])('completes a version with $name as $status', ({ extraction, status }) => {
		expect(rules.complete(queued, extraction, testNow)).toMatchObject({
			processingStatus: status,
			extractedText: extraction?.text,
			processedAt: testNow
		});
	});
});
