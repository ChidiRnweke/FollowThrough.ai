import { describe, expect, it } from 'vitest';
import { searchControllerFixture } from '$lib/testing/knowledge-search/fixtures/controller';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { Retrieval, type RetrievalDependencies } from './controller';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

// ADR 0019: "Limits that discard accepted content are defects, not chunk tuning."
const longNote =
	Array.from(
		{ length: 60 },
		(_, index) => `Section ${index}. ${'Detailed evidence for the report. '.repeat(100)}`
	).join('\n\n') + '\n\nThe relevant final approval code is amberfalcon.';

describe('searching a long note', () => {
	it('returns text from the end of a note far longer than fifty chunks', async () => {
		const { repository, provider } = searchControllerFixture();
		const knowledge = createTestContentIndex(
			repository,
			provider.model,
			{ targetTokens: 700, overlapTokens: 50 },
			false,
			provider
		);
		await knowledge.indexNote(noteBuilder({ plainText: longNote }));
		provider.rerankOrder = 'relevant-first';
		const controller = new Retrieval(
			capabilityDependencies<RetrievalDependencies>({ ...agentToolResultsFixture(), knowledge })
		);
		const results = await controller.search({ query: 'final approval code', limit: 20 });
		expect(results[0]?.content).toContain('amberfalcon');
	});
});
