import { describe, expect, it } from 'vitest';
import type { ReferenceCandidate, Url } from '$lib/models/references';
import {
	referenceSearchFixture as setup,
	referenceSelection as selection
} from '$lib/testing/references/fixtures/search';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const reference = (
	title: string,
	tier: ReferenceCandidate['tier'],
	confidence: number
): ReferenceCandidate => ({
	url: `https://example.com/${title.toLowerCase()}` as Url,
	title,
	tier,
	relevanceNote: `${title} is relevant`,
	confidence
});

describe('Reference workflow invariants', () => {
	it('returns an honest empty outcome when search finds nothing', async () => {
		const { reference: controller } = setup();
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.outcome).toBe('nothing_relevant');
	});

	it('ranks official sources before community sources', async () => {
		const { references, reference: controller } = setup();
		references.candidates = [reference('Blog', 'community', 99), reference('Spec', 'official', 70)];
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(
			result.outcome === 'found' && result.suggestions[0]?.kind === 'reference'
				? result.suggestions[0].payload.title
				: undefined
		).toBe('Spec');
	});

	it('keeps reference results in proposed state', async () => {
		const { references, reference: controller } = setup();
		references.candidates = [reference('Spec', 'standard', 90)];
		const result = await controller.suggestFromSelection(testActor(), { selection });
		expect(result.outcome === 'found' ? result.suggestions[0]?.status : undefined).toBe('proposed');
	});

	it('rolls back its anchor when reference suggestion persistence fails', async () => {
		const { content, suggestions, references, reference: controller } = setup();
		references.candidates = [reference('Spec', 'standard', 90)];
		suggestions.failCreation = true;
		try {
			await controller.suggestFromSelection(testActor(), { selection });
		} catch {
			// The restored anchor collection is the invariant under test.
		}
		expect(content.anchors).toEqual([]);
	});
});
