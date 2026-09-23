import type { ActorContext } from '$lib/models/identity';
import type { PromiseCandidate, PromiseModelContext } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';

export interface PromiseExtractor {
	extract(
		actor: ActorContext,
		selection: TextSelection,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]>;
}
export type {
	StructuredPromiseResult,
	StructuredPromiseClient
} from '$lib/server/repositories/todos/classification';
