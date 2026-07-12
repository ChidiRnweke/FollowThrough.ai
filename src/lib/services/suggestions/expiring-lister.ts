import type { ActorContext, NoteId, Suggestion, SuggestionStatus } from '$lib/models';
import type { SuggestionExpirer, SuggestionLister } from './contracts';

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
