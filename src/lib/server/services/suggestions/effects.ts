import type { ActorContext } from '$lib/models/identity';
import type { Suggestion, SuggestionId } from '$lib/models/suggestions';
import type { AppliedChange } from '$lib/models/proposal-effects';
import type {
	ApplicationEffectRepository,
	AppliedRecord
} from '$lib/server/repositories/suggestions/application-effects';
import { InvalidTransitionError } from '$lib/errors';
export class SuggestionEffects {
	constructor(private readonly effects: ApplicationEffectRepository) {}
	lock(actor: ActorContext, id: SuggestionId): Promise<void> {
		return this.effects.lock(actor, id);
	}
	record(
		actor: ActorContext,
		id: SuggestionId,
		changes: readonly AppliedChange<AppliedRecord>[]
	): Promise<void> {
		return this.effects.record(actor, id, changes);
	}
	async restore(actor: ActorContext, suggestion: Suggestion): Promise<readonly AppliedRecord[]> {
		if (suggestion.status !== 'accepted')
			throw new InvalidTransitionError('Only an accepted suggestion can be undone.');
		const effect = await this.effects.find(actor, suggestion.id);
		if (!effect)
			throw new InvalidTransitionError(
				'Cannot undo this suggestion because its changes were not recorded.'
			);
		for (const change of [...effect.changes].sort((a, b) =>
			(a.after.type + ':' + a.after.value.id).localeCompare(b.after.type + ':' + b.after.value.id)
		)) {
			if (
				change.kind !== 'unchanged' &&
				(await this.effects.lockVersion(actor, change.after)) !== change.version
			)
				throw new InvalidTransitionError(
					'Cannot undo this suggestion because its saved data has changed.'
				);
		}
		const restored: AppliedRecord[] = [];
		for (const change of [...effect.changes].reverse()) {
			if (change.kind !== 'unchanged') restored.push(await this.effects.restore(actor, change));
		}
		return restored;
	}
}
