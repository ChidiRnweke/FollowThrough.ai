import type { OperationObserver } from '$lib/models/telemetry';
import {
	Retrieval,
	type RetrievalDependencies
} from '$lib/server/controllers/knowledge-search/controller';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemorySearchRepository } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	InMemoryRetrievalProvider,
	type RetrievalProviderDouble
} from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

export const searchControllerFixture = <
	Provider extends RetrievalProviderDouble = InMemoryRetrievalProvider
>(
	overrides: Partial<RetrievalDependencies> = {},
	options: {
		readonly provider?: Provider;
		readonly observer?: OperationObserver;
	} = {}
) => {
	const repository = new InMemorySearchRepository();
	const provider = options.provider ?? new InMemoryRetrievalProvider();
	const knowledge = createTestContentIndex(
		repository,
		undefined,
		undefined,
		false,
		provider,
		options.observer
	);
	const controller = new Retrieval(
		capabilityDependencies<RetrievalDependencies>({
			...agentToolResultsFixture(),
			knowledge,
			...overrides
		})
	);
	return { controller, repository, provider, knowledge };
};
