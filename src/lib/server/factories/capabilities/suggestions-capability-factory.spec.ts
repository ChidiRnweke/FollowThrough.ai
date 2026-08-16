import { describe, expect, it } from 'vitest';
import type { Database } from '$lib/server/db';
import { createSuggestionsCapability } from './suggestions-capability-factory';
import type { Suggestion } from '$lib/models/suggestions';
import { suggestionBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';

// The factories only store the db handle; SQL runs on method calls, so a bare
// cast is enough to prove composition wiring without a database.
const db = {} as Database;

describe('createSuggestionsCapability wiring', () => {
	it('returns a cohesive bundle with inbox, lister, and finalize', () => {
		const capability = createSuggestionsCapability({
			db,
			notes: {} as never,
			provenance: {} as never,
			anchors: {} as never
		});
		expect({
			inbox: capability.inbox !== undefined,
			lister: capability.lister !== undefined,
			finalize: typeof capability.finalize
		}).toEqual({ inbox: true, lister: true, finalize: 'function' });
	});

	it('routes a todo suggestion to the finalized todoCreator', async () => {
		const created: string[] = [];
		const capability = createSuggestionsCapability({
			db,
			notes: {} as never,
			provenance: {} as never,
			anchors: {} as never
		});
		const application = capability.finalize({
			todoCreator: {
				create: async (_actor: never, input: { title: string }) => {
					created.push(input.title);
					return { id: '1' } as never;
				}
			},
			relationshipCreator: {} as never,
			referenceCreator: {} as never,
			diagramWriter: {} as never,
			todoDeleter: {} as never,
			relationshipDeleter: {} as never,
			referenceDeleter: {} as never,
			diagramDeleter: {} as never,
			memoryChangeApplier: {} as never,
			drawioValidator: { validate: () => '' },
			drawioLabels: { extract: () => '' }
		});
		await application.apply(testActor(), suggestionBuilder() as Suggestion);
		expect(created).toEqual(['Send the design']);
	});
});
