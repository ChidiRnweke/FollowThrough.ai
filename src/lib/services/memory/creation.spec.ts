import { expect, it } from 'vitest';
import { decideMemoryCreation } from './edits';
import {
	testActor,
	testMemoryEntryId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

it('defaults a new profile memory to sharing when the creation request omits that choice', () => {
	expect(
		decideMemoryCreation(
			{ content: '  Remember this  ' },
			{ id: testMemoryEntryId(), userId: testActor().userId, timestamp: testNow }
		)
	).toEqual({
		kind: 'create',
		entry: {
			id: testMemoryEntryId(),
			userId: testActor().userId,
			content: 'Remember this',
			shareWithAgents: true,
			createdAt: testNow,
			updatedAt: testNow
		}
	});
});
