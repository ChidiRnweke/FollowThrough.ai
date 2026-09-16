import type { ReferenceCandidate } from '$lib/models/references';

/** Orders the unique sources presented for review. */
export class ReferenceRanking {
	rank(candidates: readonly ReferenceCandidate[]): readonly ReferenceCandidate[] {
		const weight = { official: 0, standard: 1, vendor: 2, community: 3 };
		return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(
			(left, right) => weight[left.tier] - weight[right.tier] || right.confidence - left.confidence
		);
	}
}
