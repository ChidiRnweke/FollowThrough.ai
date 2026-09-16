import type { SuggestionContext } from '$lib/models/suggestions';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type {
	Suggestion,
	SelectionProposal,
	ProposalSelectionOrigin,
	SuggestionId,
	SuggestionProposal,
	SuggestionStatus
} from '$lib/models/suggestions';
import { materializeSuggestion, proposalFromSelection } from '$lib/models/suggestions';
import { ExpiredSuggestionError, InvalidTransitionError, NotFoundError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { SuggestionRepository } from '$lib/server/repositories/suggestions/suggestions';
export interface Clock {
	now(): DateTime;
}

export class SystemClock implements Clock {
	now(): DateTime {
		return new Date().toISOString() as DateTime;
	}
}

export class SuggestionInbox {
	constructor(
		private readonly suggestions: SuggestionRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly clock: Clock = new SystemClock()
	) {}

	async create<P extends SuggestionProposal>(
		actor: ActorContext,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
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
		return this.persist(actor, proposal);
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
		return this.persist(actor, proposalFromSelection(origin, proposal));
	}
	private async persist(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion> {
		const suggestion = materializeSuggestion(proposal, {
			id: crypto.randomUUID() as SuggestionId,
			userId: actor.userId,
			now: this.clock.now()
		});
		await this.suggestions.insert(actor, suggestion);
		return suggestion;
	}

	async get(actor: ActorContext, id: SuggestionId): Promise<Suggestion> {
		const suggestion = await this.suggestions.findById(actor, id);
		if (!suggestion) throw new NotFoundError('Suggestion was not found', { suggestionId: id });
		return suggestion;
	}

	/**
	 * Readable suggestions only, with the rest reported rather than dropped
	 * quietly.
	 *
	 * A suggestion whose payload no longer parses cannot be rendered, decided, or
	 * accepted — the payload is the whole card. So the inbox omits it, and says
	 * so where an operator will see it. That is the decision this layer is the
	 * one able to make: the repository knows a row did not read, but only the
	 * inbox knows the row was going to become a card.
	 */
	async listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		const stored = await this.suggestions.list(actor, {
			status,
			...(noteId ? { noteId } : {})
		});
		const unreadable = stored.filter((row) => row.status === 'unreadable');
		if (unreadable.length > 0)
			console.warn(
				`[suggestions] ${unreadable.length} stored suggestion(s) were left out of the inbox because their payload no longer matches their kind: ${unreadable
					.map((row) => `${row.id} (${row.kind}): ${row.reason}`)
					.join('; ')}`
			);
		return stored.flatMap((row) => (row.status === 'readable' ? [row.suggestion] : []));
	}
	async countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(actor, status)).length;
	}

	async readContexts(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionContext[]> {
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
				return { suggestion, note, anchor, provenance };
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
		if (suggestion.status !== 'accepted')
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
		noteId: NoteId,
		projectId: ProjectId
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
