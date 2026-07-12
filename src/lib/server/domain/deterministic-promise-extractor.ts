import type { ActorContext, PromiseCandidate, TextSelection } from '$lib/models';
import type { PromiseExtractor } from '$lib/services';
import { parsePromises } from './promise-parser';

export class DeterministicPromiseExtractor implements PromiseExtractor {
	async extract(
		_actor: ActorContext,
		selection: TextSelection
	): Promise<readonly PromiseCandidate[]> {
		return parsePromises(selection);
	}
}
