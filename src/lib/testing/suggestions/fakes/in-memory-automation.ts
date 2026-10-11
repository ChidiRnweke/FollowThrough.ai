import type { ActorContext } from '$lib/models/identity';
import type {
	Suggestion,
	SelectionProposal,
	ProposalSelectionOrigin,
	SuggestionId,
	SuggestionStatus
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
	SuggestionExpirer,
	SuggestionProposal,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionContextReader,
	SuggestionContext
} from '$lib/server/services/suggestions/inbox';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testNow, testSuggestionId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { DateTime } from '$lib/models/workspace';

export class InMemorySuggestionReader
	implements SuggestionLister, SuggestionExpirer, SuggestionContextReader
{
	constructor(private readonly actor: ActorContext) {}
	suggestions: Suggestion[] = [];
	contexts: SuggestionContext[] = [];
	expiryFailure: Error | undefined;

	async expire(): Promise<number> {
		if (this.expiryFailure) throw this.expiryFailure;
		let expired = 0;
		this.suggestions = this.suggestions.map((suggestion) => {
			if (
				suggestion.userId !== this.actor.userId ||
				suggestion.status !== 'proposed' ||
				suggestion.expiresAt === undefined ||
				suggestion.expiresAt > testNow
			)
				return suggestion;
			expired += 1;
			return { ...suggestion, status: 'expired', decidedAt: testNow, updatedAt: testNow };
		});
		return expired;
	}

	async listByStatus(
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		return this.suggestions.filter(
			(suggestion) =>
				suggestion.userId === this.actor.userId &&
				suggestion.status === status &&
				(!noteId || suggestion.noteId === noteId)
		);
	}

	async countByStatus(status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(status)).length;
	}

	async readContexts(suggestions: readonly Suggestion[]): Promise<readonly SuggestionContext[]> {
		return suggestions.map((suggestion) => {
			const context = this.contexts.find(
				(context) =>
					context.suggestion.id === suggestion.id && context.provenance.userId === this.actor.userId
			);
			if (!context) throw new NotFoundError('Suggestion context was not found');
			return { ...context, suggestion };
		});
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
	constructor(private readonly actor: ActorContext) {}
	suggestions: Suggestion[] = [];
	failCreation = false;
	failAcceptance = false;

	async create<P extends SuggestionProposal>(
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async create(proposal: SuggestionProposal): Promise<Suggestion> {
		if (this.failCreation) throw new ExternalServiceError('Suggestion creation failed');
		const suggestion = createProposalRecord(proposal, {
			id: testSuggestionId(this.suggestions.length + 1),
			userId: this.actor.userId,
			now: testNow
		});
		this.suggestions.push(suggestion);
		return suggestion;
	}

	async createFromSelection<P extends SelectionProposal>(
		origin: ProposalSelectionOrigin,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async createFromSelection(
		origin: ProposalSelectionOrigin,
		proposal: SelectionProposal
	): Promise<Suggestion> {
		return this.create(selectionProposal(origin, proposal));
	}

	async get(id: SuggestionId): Promise<Suggestion> {
		const suggestion = this.suggestions.find(
			(candidate) => candidate.id === id && candidate.userId === this.actor.userId
		);
		if (!suggestion) throw new NotFoundError('Suggestion was not found');
		return suggestion;
	}

	async accept(
		suggestion: Suggestion,
		appliedArtifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion> {
		if (this.failAcceptance) throw new ExternalServiceError('Acceptance persistence failed');
		this.assertPending(suggestion);
		return this.replace({
			...suggestion,
			status: 'accepted',
			decidedAt: testNow,
			appliedArtifactId,
			isAutoAccepted: autoAccepted
		});
	}

	async reject(suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.replace({ ...suggestion, status: 'rejected', decidedAt: testNow });
	}

	async revert(suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted')
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		return this.replace({ ...suggestion, status: 'reverted' });
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

	private replace(suggestion: Suggestion): Suggestion {
		const current = this.suggestions.find(
			(candidate) => candidate.id === suggestion.id && candidate.userId === this.actor.userId
		);
		if (!current) throw new NotFoundError('Suggestion was not found');
		this.suggestions = this.suggestions.map((candidate) =>
			candidate.id === suggestion.id ? suggestion : candidate
		);
		return suggestion;
	}
}

type SuggestionIdentity = {
	readonly id: SuggestionId;
	readonly userId: ActorContext['userId'];
	readonly now: DateTime;
};
function createProposalRecord<P extends SuggestionProposal>(
	proposal: P,
	identity: SuggestionIdentity
): Extract<Suggestion, { kind: P['kind'] }>;
function createProposalRecord(
	proposal: SuggestionProposal,
	identity: SuggestionIdentity
): Suggestion {
	const common = {
		id: identity.id,
		userId: identity.userId,
		status: 'proposed' as const,
		provenanceId: proposal.provenanceId,
		isAutoAccepted: false,
		createdAt: identity.now,
		updatedAt: identity.now,
		...(proposal.noteId !== undefined ? { noteId: proposal.noteId } : {}),
		...(proposal.confidence !== undefined
			? { confidence: proposal.confidence as Suggestion['confidence'] }
			: {}),
		...(proposal.sourceAnchorId !== undefined ? { sourceAnchorId: proposal.sourceAnchorId } : {})
	};
	switch (proposal.kind) {
		case 'todo':
			return { ...common, kind: 'todo', payload: proposal.payload };
		case 'backlink':
			return { ...common, kind: 'backlink', payload: proposal.payload };
		case 'reference':
			return { ...common, kind: 'reference', payload: proposal.payload };
		case 'diagram':
			return { ...common, kind: 'diagram', payload: proposal.payload };
		case 'memory':
			return { ...common, kind: 'memory', payload: proposal.payload };
	}
}

function selectionProposal<P extends SelectionProposal>(
	origin: ProposalSelectionOrigin,
	proposal: P
): Extract<SuggestionProposal, { kind: P['kind'] }>;
function selectionProposal(
	origin: ProposalSelectionOrigin,
	proposal: SelectionProposal
): SuggestionProposal {
	const source = { sourceAnchorId: origin.anchor.id, provenanceId: origin.provenance.id };
	const common = { ...source, noteId: origin.note.id, confidence: proposal.confidence };
	switch (proposal.kind) {
		case 'todo':
			return {
				...common,
				kind: 'todo',
				payload: { ...proposal.payload, ...source, projectId: origin.note.projectId }
			};
		case 'backlink':
			return {
				...common,
				kind: 'backlink',
				payload: { ...proposal.payload, ...source, sourceNoteId: origin.note.id }
			};
		case 'reference':
			return {
				...common,
				kind: 'reference',
				payload: { ...proposal.payload, ...source, noteId: origin.note.id }
			};
	}
}
