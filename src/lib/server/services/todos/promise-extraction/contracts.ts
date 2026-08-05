import type { ActorContext } from '$lib/models/identity';
import type { PromiseCandidate } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';

export interface PromiseExtractor {
	extract(
		actor: ActorContext,
		selection: TextSelection,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]>;
}
export interface StructuredPromiseResult {
	readonly action: string;
	readonly ownerName: string | null;
	readonly responsibility: 'mine' | 'waiting_on';
	readonly dueDateVerbatim: string | null;
	readonly resolvedDueDate: string | null;
	readonly strength: 'explicit' | 'implied' | 'tentative';
	readonly confidence: number;
}
export interface StructuredPromiseClient {
	extract(
		text: string,
		signal?: AbortSignal
	): Promise<readonly StructuredPromiseResult[] | undefined>;
}
