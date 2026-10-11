import type { Suggestion, SuggestionId } from '$lib/models/suggestions';
import type { AppliedChange } from '$lib/models/proposal-effects';
import type {
	ApplicationEffectRepository,
	AppliedRecord
} from '$lib/server/repositories/suggestions/application-effects';
import { InvalidTransitionError } from '$lib/errors';
export interface SuggestionEffectService {
	lock(id: SuggestionId): Promise<void>;
	record(id: SuggestionId, changes: readonly AppliedChange<AppliedRecord>[]): Promise<void>;
	restore(suggestion: Suggestion): Promise<readonly AppliedRecord[]>;
}
export class SuggestionEffects implements SuggestionEffectService {
	constructor(private readonly effects: ApplicationEffectRepository) {}
	lock(id: SuggestionId): Promise<void> {
		return this.effects.lock(id);
	}
	record(id: SuggestionId, changes: readonly AppliedChange<AppliedRecord>[]): Promise<void> {
		return this.effects.record(id, changes);
	}
	async restore(suggestion: Suggestion): Promise<readonly AppliedRecord[]> {
		if (suggestion.status !== 'accepted')
			throw new InvalidTransitionError('Only an accepted suggestion can be undone.');
		const effect = await this.effects.find(suggestion.id);
		if (!effect)
			throw new InvalidTransitionError(
				'Cannot undo this suggestion because its changes were not recorded.'
			);
		for (const change of [...effect.changes].sort((a, b) =>
			(a.after.type + ':' + a.after.value.id).localeCompare(b.after.type + ':' + b.after.value.id)
		)) {
			if (
				change.kind !== 'unchanged' &&
				(await this.effects.lockVersion(change.after)) !== change.version
			)
				throw new InvalidTransitionError(
					'Cannot undo this suggestion because its saved data has changed.'
				);
		}
		const restored: AppliedRecord[] = [];
		for (const change of [...effect.changes].reverse()) {
			if (change.kind !== 'unchanged') restored.push(await this.effects.restore(change));
		}
		return restored;
	}
}
