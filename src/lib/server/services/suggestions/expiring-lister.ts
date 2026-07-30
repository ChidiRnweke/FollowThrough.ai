import type { ActorContext, NoteId, Suggestion, SuggestionStatus } from '$lib/models';

interface SuggestionExpirer {
	expire(actor: ActorContext): Promise<number>;
}

interface SuggestionLister {
	listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: NoteId
	): Promise<readonly Suggestion[]>;
	countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number>;
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
