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
	lock(suggestionId: SuggestionId): Promise<void>;
	find(suggestionId: SuggestionId): Promise<ApplicationEffect<AppliedRecord> | null>;
	record(
		suggestionId: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void>;
	lockVersion(record: AppliedRecord): Promise<string | null>;
	restore(change: AppliedChange<AppliedRecord>): Promise<AppliedRecord>;
}
