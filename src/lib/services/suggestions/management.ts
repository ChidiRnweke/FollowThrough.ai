import type {
	ActorContext,
	DateTime,
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	SuggestionView
} from '$lib/models';
import { ExpiredSuggestionError, InvalidTransitionError, NotFoundError } from '$lib/models';
import type {
	NoteRepository,
	ProvenanceRepository,
	SourceAnchorRepository,
	SuggestionRepository
} from '$lib/repositories';
import type {
	SuggestionAccepter,
	SuggestionCreator,
	SuggestionExpirer,
	SuggestionFinder,
	SuggestionLister,
	SuggestionProposal,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionViewAssembler
} from './contracts';

export interface Clock {
	now(): DateTime;
}

export class SystemClock implements Clock {
	now(): DateTime {
		return new Date().toISOString() as DateTime;
	}
}

export class SuggestionManagementService
	implements
		SuggestionCreator,
		SuggestionFinder,
		SuggestionLister,
		SuggestionViewAssembler,
		SuggestionAccepter,
		SuggestionRejecter,
		SuggestionReverter,
		SuggestionExpirer
{
	constructor(
		private readonly suggestions: SuggestionRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly clock: Clock = new SystemClock()
	) {}

	async create(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion> {
		const [note, provenance, anchor] = await Promise.all([
			proposal.noteId ? this.notes.findById(actor, proposal.noteId) : undefined,
			this.provenance.findById(actor, proposal.provenanceId),
			proposal.sourceAnchorId ? this.anchors.findById(actor, proposal.sourceAnchorId) : undefined
		]);
		if (proposal.noteId && !note) throw new NotFoundError('Suggestion note was not found');
		if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
		if (proposal.sourceAnchorId && !anchor)
			throw new NotFoundError('Suggestion source anchor was not found');
		if (proposal.noteId && anchor && anchor.noteId !== proposal.noteId)
			throw new InvalidTransitionError('Suggestion anchor must belong to its note');
		if (note && !this.payloadBelongsToNote(proposal, note.id, note.projectId))
			throw new InvalidTransitionError('Suggestion payload must belong to its source note');
		const timestamp = this.clock.now();
		return this.suggestions.insert(actor, {
			id: crypto.randomUUID() as SuggestionId,
			userId: actor.userId,
			...(proposal.noteId ? { noteId: proposal.noteId } : {}),
			kind: proposal.kind,
			status: 'proposed',
			payload: proposal.payload,
			...(proposal.confidence !== undefined
				? { confidence: proposal.confidence as Suggestion['confidence'] }
				: {}),
			provenanceId: proposal.provenanceId,
			...(proposal.sourceAnchorId ? { sourceAnchorId: proposal.sourceAnchorId } : {}),
			isAutoAccepted: false,
			createdAt: timestamp,
			updatedAt: timestamp
		} as Suggestion);
	}

	async get(actor: ActorContext, id: SuggestionId): Promise<Suggestion> {
		const suggestion = await this.suggestions.findById(actor, id);
		if (!suggestion) throw new NotFoundError('Suggestion was not found', { suggestionId: id });
		return suggestion;
	}

	listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		return this.suggestions.list(actor, { status, ...(noteId ? { noteId } : {}) });
	}
	async countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(actor, status)).length;
	}

	async assemble(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionView[]> {
		return Promise.all(
			suggestions.map(async (suggestion) => {
				const [provenance, note, anchor] = await Promise.all([
					this.provenance.findById(actor, suggestion.provenanceId),
					suggestion.noteId ? this.notes.findById(actor, suggestion.noteId) : undefined,
					suggestion.sourceAnchorId
						? this.anchors.findById(actor, suggestion.sourceAnchorId)
						: undefined
				]);
				if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
				return {
					suggestion,
					...(note ? { note: { id: note.id, title: note.title } } : {}),
					...(anchor ? { anchor } : {}),
					provenance
				};
			})
		);
	}

	async accept(
		actor: ActorContext,
		suggestion: Suggestion,
		artifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.transition(actor, suggestion, 'proposed', {
			status: 'accepted',
			decidedAt: this.clock.now(),
			appliedArtifactType: suggestion.kind,
			appliedArtifactId: artifactId,
			isAutoAccepted: autoAccepted,
			updatedAt: this.clock.now()
		});
	}
	async reject(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.transition(actor, suggestion, 'proposed', {
			status: 'rejected',
			decidedAt: this.clock.now(),
			updatedAt: this.clock.now()
		});
	}
	async revert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted' || !suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		return this.transition(actor, suggestion, 'accepted', {
			status: 'reverted',
			decidedAt: this.clock.now(),
			updatedAt: this.clock.now()
		});
	}
	async expire(actor: ActorContext): Promise<number> {
		return this.suggestions.expireProposedThrough(actor, this.clock.now());
	}

	private async transition(
		actor: ActorContext,
		suggestion: Suggestion,
		expected: SuggestionStatus,
		patch: Parameters<SuggestionRepository['transition']>[3]
	): Promise<Suggestion> {
		const updated = await this.suggestions.transition(actor, suggestion.id, expected, patch);
		if (!updated)
			throw new InvalidTransitionError(
				expected === 'proposed'
					? 'Suggestion is no longer pending'
					: 'Suggestion cannot be reverted'
			);
		return updated;
	}
	private assertPending(suggestion: Suggestion): void {
		if (suggestion.expiresAt && suggestion.expiresAt <= this.clock.now())
			throw new ExpiredSuggestionError('Suggestion has expired');
		if (suggestion.status !== 'proposed')
			throw new InvalidTransitionError('Suggestion is not pending');
	}

	private payloadBelongsToNote(
		proposal: SuggestionProposal,
		noteId: import('$lib/models').NoteId,
		projectId: import('$lib/models').ProjectId
	): boolean {
		switch (proposal.kind) {
			case 'todo':
				return proposal.payload.projectId === projectId;
			case 'backlink':
				return proposal.payload.sourceNoteId === noteId;
			case 'reference':
			case 'diagram':
				return proposal.payload.noteId === noteId;
			case 'memory':
				return proposal.payload.projectId === projectId;
		}
	}
}
