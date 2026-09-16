import { describe, expect, it } from 'vitest';
import { setupAttachments } from '$lib/testing/attachments/fixtures/processing';
import { view } from '$lib/testing/attachments/fakes/processing';
import { TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

describe('repairing historical truncated attachment indexes', () => {
	it('keeps saved extraction eligible for repair when indexing fails', async () => {
		const { repository, search, worker } = setupAttachments(new TokenAwareChunker(30, 5));
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
		await worker.process(testActor(), original.version.id);
		expect({
			version: repository.found.version,
			pending: await repository.listPendingVersions()
		}).toEqual({
			version: {
				...original.version,
				processingStatus: 'partial',
				parserKind: 'text',
				extractedText: text
			},
			pending: [{ ...testActor(), versionId: original.version.id }]
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
		await worker.run();
		expect(repository.found).toEqual(before);
	});
});
