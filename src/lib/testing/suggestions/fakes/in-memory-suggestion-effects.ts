import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { SuggestionId } from '$lib/models/suggestions';
import type { AppliedChange } from '$lib/models/proposal-effects';
import type { AppliedRecord } from '$lib/server/repositories/suggestions/application-effects';
import { SuggestionEffects } from '$lib/server/services/suggestions/effects';
import { InMemoryApplicationEffects } from './in-memory-application-effects';
export class InMemorySuggestionEffects extends SuggestionEffects {
	constructor(readonly repository = new InMemoryApplicationEffects(testActor())) {
		super(repository);
	}
	override async record(
		id: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void> {
		for (const change of changes) this.repository.put(change.after);
		await super.record(id, changes);
	}
	snapshot() {
		return this.repository.snapshot();
	}
}
