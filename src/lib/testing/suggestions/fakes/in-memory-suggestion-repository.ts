import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { Suggestion, SuggestionId, SuggestionStatus } from '$lib/models/suggestions';
import type {
	SuggestionRepository,
	SuggestionTransition
} from '$lib/server/repositories/suggestions/suggestions';

export class InMemorySuggestionRepository implements SuggestionRepository {
	suggestions: Suggestion[] = [];
	async findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined> {
		return this.suggestions.find((item) => item.id === id && item.userId === actor.userId);
	}
	async list(
		actor: ActorContext,
		filter: { noteId?: Suggestion['noteId']; status?: SuggestionStatus }
	): Promise<readonly Suggestion[]> {
		return this.suggestions.filter(
			(item) =>
				item.userId === actor.userId &&
				(filter.noteId === undefined || item.noteId === filter.noteId) &&
				(filter.status === undefined || item.status === filter.status)
		);
	}
	async insert(_actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		this.suggestions.push(suggestion);
		return suggestion;
	}
	async transition(
		actor: ActorContext,
		id: SuggestionId,
		expectedStatus: SuggestionStatus,
		patch: SuggestionTransition
	): Promise<Suggestion | undefined> {
		const current = this.suggestions.find(
			(item) => item.id === id && item.userId === actor.userId && item.status === expectedStatus
		);
		if (!current) return undefined;
		const updated = { ...current, ...patch } as Suggestion;
		this.suggestions = this.suggestions.map((item) => (item.id === id ? updated : item));
		return updated;
	}
	async expireProposedThrough(actor: ActorContext, through: DateTime): Promise<number> {
		const eligible = this.suggestions.filter(
			(item) =>
				item.userId === actor.userId &&
				item.status === 'proposed' &&
				item.expiresAt !== undefined &&
				item.expiresAt <= through
		);
		const ids = new Set(eligible.map((item) => item.id));
		this.suggestions = this.suggestions.map((item) =>
			ids.has(item.id)
				? { ...item, status: 'expired', decidedAt: through, updatedAt: through }
				: item
		) as Suggestion[];
		return eligible.length;
	}
}
