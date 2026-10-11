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
import { ExpiredSuggestionError, InvalidTransitionError, NotFoundError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { SuggestionRepository } from '$lib/server/repositories/suggestions/suggestions';
export type { SuggestionProposal, SuggestionContext } from '$lib/models/suggestions';
export type { AppliedRecord } from '$lib/server/repositories/suggestions/application-effects';
export interface Clock {
	now(): DateTime;
}
export interface SuggestionCreator {
	create<P extends SuggestionProposal>(
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	createFromSelection<P extends SelectionProposal>(
		origin: ProposalSelectionOrigin,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
}
export interface SuggestionFinder {
	get(id: SuggestionId): Promise<Suggestion>;
}
export interface SuggestionLister {
	listByStatus(status: SuggestionStatus, noteId?: NoteId): Promise<readonly Suggestion[]>;
	countByStatus(status: SuggestionStatus): Promise<number>;
}
export interface SuggestionContextReader {
	readContexts(suggestions: readonly Suggestion[]): Promise<readonly SuggestionContext[]>;
}
export interface SuggestionAccepter {
	accept(
		suggestion: Suggestion,
		appliedArtifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion>;
}
export interface SuggestionRejecter {
	reject(suggestion: Suggestion): Promise<Suggestion>;
}
export interface SuggestionReverter {
	revert(suggestion: Suggestion): Promise<Suggestion>;
}
export interface SuggestionExpirer {
	expire(): Promise<number>;
}
export class SuggestionCreationService implements SuggestionCreator {
	constructor(
		private readonly actor: ActorContext,
		private readonly suggestions: SuggestionRepository,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly clock: Clock
	) {}
	async create<P extends SuggestionProposal>(
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async create(proposal: SuggestionProposal): Promise<Suggestion> {
		const [note, provenance, anchor] = await Promise.all([
			proposal.noteId ? this.notes.findById(proposal.noteId) : undefined,
			this.provenance.findById(proposal.provenanceId),
			proposal.sourceAnchorId ? this.anchors.findById(proposal.sourceAnchorId) : undefined
		]);
		if (proposal.noteId && !note) throw new NotFoundError('Suggestion note was not found');
		if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
		if (proposal.sourceAnchorId && !anchor)
			throw new NotFoundError('Suggestion source anchor was not found');
		if (proposal.noteId && anchor && anchor.noteId !== proposal.noteId)
			throw new InvalidTransitionError('Suggestion anchor must belong to its note');
		if (note && !this.payloadBelongsToNote(proposal, note.id, note.projectId))
			throw new InvalidTransitionError('Suggestion payload must belong to its source note');
		return this.persist(proposal);
	}
	async createFromSelection<P extends SelectionProposal>(
		origin: ProposalSelectionOrigin,
		proposal: P
	): Promise<Extract<Suggestion, { kind: P['kind'] }>>;
	async createFromSelection(
		origin: ProposalSelectionOrigin,
		proposal: SelectionProposal
	): Promise<Suggestion> {
		return this.persist(selectionProposal(origin, proposal));
	}
	private async persist(proposal: SuggestionProposal): Promise<Suggestion> {
		const suggestion = createProposalRecord(proposal, {
			id: crypto.randomUUID() as SuggestionId,
			userId: this.actor.userId,
			now: this.clock.now()
		});
		await this.suggestions.insert(suggestion);
		return suggestion;
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
export class SuggestionReadingService implements SuggestionFinder, SuggestionLister {
	constructor(private readonly suggestions: SuggestionRepository) {}
	async get(id: SuggestionId): Promise<Suggestion> {
		const suggestion = await this.suggestions.findById(id);
		if (!suggestion) throw new NotFoundError('Suggestion was not found', { suggestionId: id });
		return suggestion;
	}
	async listByStatus(
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		const stored = await this.suggestions.list({
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
	async countByStatus(status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(status)).length;
	}
}
export class SuggestionContextService implements SuggestionContextReader {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly anchors: SourceAnchorRepository
	) {}
	async readContexts(suggestions: readonly Suggestion[]): Promise<readonly SuggestionContext[]> {
		return Promise.all(
			suggestions.map(async (suggestion) => {
				const [provenance, note, anchor] = await Promise.all([
					this.provenance.findById(suggestion.provenanceId),
					suggestion.noteId ? this.notes.findById(suggestion.noteId) : undefined,
					suggestion.sourceAnchorId ? this.anchors.findById(suggestion.sourceAnchorId) : undefined
				]);
				if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
				return { suggestion, note, anchor, provenance };
			})
		);
	}
}
export class SuggestionLifecycleService
	implements SuggestionAccepter, SuggestionRejecter, SuggestionReverter, SuggestionExpirer
{
	constructor(
		private readonly actor: ActorContext,
		private readonly suggestions: SuggestionRepository,
		private readonly clock: Clock
	) {}
	async accept(
		suggestion: Suggestion,
		artifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.transition(suggestion, 'proposed', {
			status: 'accepted',
			decidedAt: this.clock.now(),
			appliedArtifactType: suggestion.kind,
			appliedArtifactId: artifactId,
			isAutoAccepted: autoAccepted,
			updatedAt: this.clock.now()
		});
	}
	async reject(suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		return this.transition(suggestion, 'proposed', {
			status: 'rejected',
			decidedAt: this.clock.now(),
			updatedAt: this.clock.now()
		});
	}
	async revert(suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted')
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		return this.transition(suggestion, 'accepted', {
			status: 'reverted',
			decidedAt: this.clock.now(),
			updatedAt: this.clock.now()
		});
	}
	async expire(): Promise<number> {
		return this.suggestions.expireProposedThrough(this.clock.now());
	}
	private async transition(
		suggestion: Suggestion,
		expected: SuggestionStatus,
		patch: Parameters<SuggestionRepository['transition']>[2]
	): Promise<Suggestion> {
		const updated = await this.suggestions.transition(suggestion.id, expected, patch);
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
