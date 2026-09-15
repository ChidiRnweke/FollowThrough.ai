import type { ActorContext } from '$lib/models/identity';
import type { SuggestionId } from '$lib/models/suggestions';
import type { ApplicationEffect, AppliedChange } from '$lib/models/proposal-effects';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { ExternalReference } from '$lib/models/references';
export type AppliedRecord =
	| Extract<
			WorkspaceRecord,
			{ type: 'todos' | 'note_relationships' | 'diagrams' | 'memory_entries' }
	  >
	| { readonly type: 'references'; readonly value: ExternalReference };
export interface ApplicationEffectRepository {
	lock(actor: ActorContext, suggestionId: SuggestionId): Promise<void>;
	find(
		actor: ActorContext,
		suggestionId: SuggestionId
	): Promise<ApplicationEffect<AppliedRecord> | null>;
	record(
		actor: ActorContext,
		suggestionId: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void>;
	lockVersion(actor: ActorContext, record: AppliedRecord): Promise<string | null>;
	restore(actor: ActorContext, change: AppliedChange<AppliedRecord>): Promise<AppliedRecord>;
}
