import type { ActorContext, PromiseCandidate, TextSelection } from '$lib/models';

export interface PromiseExtractor {
	extract(actor: ActorContext, selection: TextSelection): Promise<readonly PromiseCandidate[]>;
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
	extract(text: string): Promise<readonly StructuredPromiseResult[] | undefined>;
}
