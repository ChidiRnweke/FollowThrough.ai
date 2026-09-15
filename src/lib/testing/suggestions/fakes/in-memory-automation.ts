import type { ActorContext } from '$lib/models/identity';
import type {
	Suggestion,
	SelectionProposal,
	ProposalSelectionOrigin,
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
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testNow, testSuggestionId } from '$lib/testing/workspace/fixtures/domain-builders';
import { materializeSuggestion, proposalFromSelection } from '$lib/models/suggestions';

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
			origin: { pipeline: 'memory' as const, createdAt: suggestion.createdAt }
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

	async create<P extends SuggestionProposal>(
		actor: ActorContext,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async create(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion> {
		if (this.failCreation) throw new ExternalServiceError('Suggestion creation failed');
		const suggestion = materializeSuggestion(proposal, {
			id: testSuggestionId(this.suggestions.length + 1),
			userId: actor.userId,
			now: testNow
		});
		this.suggestions.push(suggestion);
		return suggestion;
	}

	async createFromSelection<P extends SelectionProposal>(
		actor: ActorContext,
		origin: ProposalSelectionOrigin,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async createFromSelection(
		actor: ActorContext,
		origin: ProposalSelectionOrigin,
		proposal: SelectionProposal
	): Promise<Suggestion> {
		return this.create(actor, proposalFromSelection(origin, proposal));
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
			decidedAt: testNow,
			appliedArtifactId,
			isAutoAccepted: autoAccepted
		});
	}

	async reject(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.replace(actor, { ...suggestion, status: 'rejected', decidedAt: testNow });
	}

	async revert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted' || !suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		return this.replace(actor, { ...suggestion, status: 'reverted' });
	}

	snapshot(): RestoreSnapshot {
		const suggestions = structuredClone(this.suggestions);
		return () => {
			this.suggestions = suggestions;
		};
	}

	private assertPending(
		suggestion: Suggestion
	): asserts suggestion is Extract<Suggestion, { status: 'proposed' }> {
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
