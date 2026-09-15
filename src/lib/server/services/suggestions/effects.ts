import type { ActorContext } from '$lib/models/identity';
import type { Suggestion, SuggestionId } from '$lib/models/suggestions';
import type {
	AppliedChange,
	ApplicationEffect,
	UndoAvailability
} from '$lib/models/proposal-effects';
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
	async availability(actor: ActorContext, suggestion: Suggestion): Promise<UndoAvailability> {
		const result = await this.resolve(actor, suggestion);
		return result.kind === 'available' ? { kind: 'available' } : result;
	}
	private async resolve(
		actor: ActorContext,
		suggestion: Suggestion
	): Promise<
		| (Extract<UndoAvailability, { kind: 'available' }> & {
				effect: ApplicationEffect<AppliedRecord>;
		  })
		| Extract<UndoAvailability, { kind: 'unavailable' }>
	> {
		if (suggestion.status !== 'accepted')
			return {
				kind: 'unavailable',
				reason: 'not-accepted',
				message: 'Only an accepted proposal can be undone.'
			};
		const effect = await this.effects.find(actor, suggestion.id);
		if (!effect)
			return {
				kind: 'unavailable',
				reason: 'unrecorded',
				message:
					'Undo is unavailable because this suggestion has no recorded changes. Its saved data is unchanged.'
			};
		for (const change of [...effect.changes].sort((a, b) =>
			(a.after.type + ':' + a.after.value.id).localeCompare(b.after.type + ':' + b.after.value.id)
		)) {
			if (
				change.kind !== 'unchanged' &&
				(await this.effects.lockVersion(actor, change.after)) !== change.version
			)
				return {
					kind: 'unavailable',
					reason: 'changed',
					message:
						'The saved data changed after this proposal was accepted. Undo would overwrite those edits.'
				};
		}
		return { kind: 'available', effect };
	}
	async restore(actor: ActorContext, suggestion: Suggestion): Promise<readonly AppliedRecord[]> {
		const availability = await this.resolve(actor, suggestion);
		if (availability.kind === 'unavailable') throw new InvalidTransitionError(availability.message);
		const effect = availability.effect;
		const restored: AppliedRecord[] = [];
		for (const change of [...effect.changes].reverse()) {
			if (change.kind !== 'unchanged') restored.push(await this.effects.restore(actor, change));
		}
		return restored;
	}
}
