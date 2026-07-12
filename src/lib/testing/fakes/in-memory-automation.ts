import type { ActorContext, Suggestion, SuggestionId } from '$lib/models';
import {
	ExpiredSuggestionError,
	ExternalServiceError,
	InvalidTransitionError,
	NotFoundError
} from '$lib/models';
import type {
	SuggestionAccepter,
	SuggestionCreator,
	SuggestionFinder,
	SuggestionProposal,
	SuggestionRejecter,
	SuggestionReverter
} from '$lib/services';
import type { SnapshotParticipant } from './in-memory-transaction';
import type { SuggestionExpiryStore } from '$lib/repositories';
import { testNow, testSuggestionId } from '../fixtures/domain-builders';

export class InMemorySuggestions
	implements
		SuggestionCreator,
		SuggestionFinder,
		SuggestionAccepter,
		SuggestionRejecter,
		SuggestionReverter,
		SuggestionExpiryStore,
		SnapshotParticipant
{
	suggestions: Suggestion[] = [];
	failCreation = false;
	failAcceptance = false;

	async create(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion> {
		if (this.failCreation) throw new ExternalServiceError('Suggestion creation failed');
		const suggestion = {
			id: testSuggestionId(this.suggestions.length + 1),
			userId: actor.userId,
			kind: proposal.kind,
			status: 'proposed',
			payload: proposal.payload,
			provenanceId: proposal.provenanceId,
			isAutoAccepted: false,
			createdAt: testNow,
			updatedAt: testNow,
			...(proposal.noteId !== undefined ? { noteId: proposal.noteId } : {}),
			...(proposal.confidence !== undefined
				? { confidence: proposal.confidence as Suggestion['confidence'] }
				: {}),
			...(proposal.sourceAnchorId !== undefined ? { sourceAnchorId: proposal.sourceAnchorId } : {})
		} as Suggestion;
		this.suggestions.push(suggestion);
		return suggestion;
	}

	async get(actor: ActorContext, id: SuggestionId): Promise<Suggestion> {
		const suggestion = this.suggestions.find(
			(candidate) => candidate.id === id && candidate.userId === actor.userId
		);
		if (!suggestion) throw new NotFoundError('Suggestion was not found');
		return suggestion;
	}

	async accept(
		actor: ActorContext,
		suggestion: Suggestion,
		appliedArtifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion> {
		if (this.failAcceptance) throw new ExternalServiceError('Acceptance persistence failed');
		this.assertPending(suggestion);
		return this.replace(actor, {
			...suggestion,
			status: 'accepted',
			appliedArtifactId,
			isAutoAccepted: autoAccepted
		});
	}

	async reject(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.replace(actor, { ...suggestion, status: 'rejected' });
	}

	async revert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted' || !suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		return this.replace(actor, { ...suggestion, status: 'reverted' });
	}

	snapshot(): unknown {
		return structuredClone(this.suggestions);
	}

	restore(snapshot: unknown): void {
		this.suggestions = snapshot as Suggestion[];
	}

	async listExpiredProposed(actor: ActorContext, through: string): Promise<readonly Suggestion[]> {
		return this.suggestions.filter(
			(suggestion) =>
				suggestion.userId === actor.userId &&
				suggestion.status === 'proposed' &&
				suggestion.expiresAt !== undefined &&
				suggestion.expiresAt <= through
		);
	}

	async markExpired(actor: ActorContext, ids: readonly SuggestionId[]): Promise<void> {
		const selected = new Set(ids);
		this.suggestions = this.suggestions.map((suggestion) =>
			suggestion.userId === actor.userId &&
			suggestion.status === 'proposed' &&
			selected.has(suggestion.id)
				? { ...suggestion, status: 'expired' }
				: suggestion
		);
	}

	private assertPending(suggestion: Suggestion): void {
		if (suggestion.expiresAt && suggestion.expiresAt < new Date().toISOString())
			throw new ExpiredSuggestionError('Suggestion has expired');
		if (suggestion.status !== 'proposed')
			throw new InvalidTransitionError('Suggestion is not pending');
	}

	private replace(actor: ActorContext, suggestion: Suggestion): Suggestion {
		const current = this.suggestions.find(
			(candidate) => candidate.id === suggestion.id && candidate.userId === actor.userId
		);
		if (!current) throw new NotFoundError('Suggestion was not found');
		this.suggestions = this.suggestions.map((candidate) =>
			candidate.id === suggestion.id ? suggestion : candidate
		);
		return suggestion;
	}
}
