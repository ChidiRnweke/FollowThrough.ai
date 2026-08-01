import type { ActorContext } from '$lib/models/identity';
import type {
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	SuggestionView
} from '$lib/models/suggestions';
import {
	ExpiredSuggestionError,
	ExternalServiceError,
	InvalidTransitionError,
	NotFoundError
} from '$lib/errors';
import type {
	SuggestionAccepter,
	SuggestionCreator,
	SuggestionFinder,
	SuggestionLister,
	SuggestionProposal,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionViewAssembler
} from '$lib/server/services/suggestions/contracts';
import type { SnapshotParticipant } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testNow, testSuggestionId } from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemorySuggestionReader implements SuggestionLister, SuggestionViewAssembler {
	suggestions: Suggestion[] = [];

	async listByStatus(
		_actor: ActorContext,
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		return this.suggestions.filter(
			(suggestion) => suggestion.status === status && (!noteId || suggestion.noteId === noteId)
		);
	}

	async countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(actor, status)).length;
	}

	async assemble(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionView[]> {
		return suggestions.map((suggestion) => ({
			suggestion,
			provenance: {
				id: suggestion.provenanceId,
				userId: actor.userId,
				producerKind: 'agent',
				producerName: 'Agent memory',
				pipeline: 'memory',
				metadata: {},
				createdAt: suggestion.createdAt
			}
		}));
	}
}

export class InMemorySuggestions
	implements
		SuggestionCreator,
		SuggestionFinder,
		SuggestionAccepter,
		SuggestionRejecter,
		SuggestionReverter,
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
