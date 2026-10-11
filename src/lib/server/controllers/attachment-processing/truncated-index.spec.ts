import { describe, expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';

describe('repairing historical truncated attachment indexes', () => {
	it('keeps saved extraction eligible for repair when indexing fails', async () => {
		const { repository, search, worker } = setupAttachments({ targetTokens: 30, overlapTokens: 5 });
		const original = view('text/plain');
		const text = Array.from(
			{ length: 60 },
			(_, index) => `Section ${index}. ${'Saved evidence. '.repeat(10)}`
		).join('\n\n');
		repository.found = {
			...original,
			version: {
				...original.version,
				processingStatus: 'partial',
				parserKind: 'text',
				extractedText: text
			}
		};
		search.stageFailure = new Error('Index unavailable');
		await worker.process(original.version.id);
		const afterFailure = repository.found.version;
		search.stageFailure = undefined;
		await worker.process(original.version.id);
		expect({
			afterFailure,
			afterRepair: repository.found.version.processingStatus
		}).toEqual({
			afterFailure: {
				...original.version,
				processingStatus: 'partial',
				parserKind: 'text',
				extractedText: text
			},
			afterRepair: 'ready'
		});
	});

	it('leaves actual extraction failures for explicit retry', async () => {
		const { repository, worker } = setupAttachments();
		const original = view('image/png');
		repository.found = {
			...original,
			version: {
				...original.version,
				processingStatus: 'partial',
				parserKind: 'ocr',
				extractedText: 'Recovered text',
				processingFailure: 'Image description failed'
			}
		};
		const before = structuredClone(repository.found);
		await worker.process(repository.found.version.id);
		expect(repository.found).toEqual(before);
	});
});
