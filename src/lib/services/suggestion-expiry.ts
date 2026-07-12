import type { ActorContext, DateTime, NoteId, Suggestion, SuggestionStatus } from '../models';
import type { SuggestionExpiryStore } from '../repositories';
import type { SuggestionExpirer, SuggestionLister } from './suggestions';

export interface Clock {
	now(): DateTime;
}

export class SystemClock implements Clock {
	now(): DateTime {
		return new Date().toISOString() as DateTime;
	}
}

export class SuggestionExpiryService implements SuggestionExpirer {
	constructor(
		private readonly store: SuggestionExpiryStore,
		private readonly clock: Clock = new SystemClock()
	) {}

	async expire(actor: ActorContext): Promise<number> {
		const expired = await this.store.listExpiredProposed(actor, this.clock.now());
		if (expired.length)
			await this.store.markExpired(
				actor,
				expired.map((item) => item.id)
			);
		return expired.length;
	}
}

export class ExpiringSuggestionLister implements SuggestionLister {
	constructor(
		private readonly expirer: SuggestionExpirer,
		private readonly lister: SuggestionLister
	) {}

	async listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: NoteId
	): Promise<readonly Suggestion[]> {
		await this.expirer.expire(actor);
		return this.lister.listByStatus(actor, status, noteId);
	}

	async countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number> {
		await this.expirer.expire(actor);
		return this.lister.countByStatus(actor, status);
	}
}
