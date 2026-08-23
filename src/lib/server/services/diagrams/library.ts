import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramId,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, OwnershipError } from '$lib/errors';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class DiagramLibrary {
	constructor(
		private readonly diagrams: DiagramRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findById(actor, diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]> {
		if (!(await this.notes.findById(actor, noteId))) throw new NotFoundError('Note was not found');
		return this.diagrams.listForNote(actor, noteId);
	}
	listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput> {
		return this.diagrams.listForProject(actor, projectId, params);
	}
	/** How many diagrams a project holds, for a screen that shows only the number. */
	countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	): Promise<number> {
		return this.diagrams.countForProject(actor, projectId, params);
	}
	async create(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		if (diagram.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s diagram');
		// A studio diagram has no source note, so there is nothing to check; one
		// created from a note must still name a note that exists.
		if (
			diagram.sourceNoteId !== undefined &&
			!(await this.notes.findById(actor, diagram.sourceNoteId))
		)
			throw new NotFoundError('Diagram note was not found');
		if (diagram.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, diagram.sourceAnchorId);
			if (!anchor || anchor.noteId !== diagram.sourceNoteId)
				throw new NotFoundError('Diagram source anchor was not found');
		}
		if (diagram.provenanceId && !(await this.provenance.findById(actor, diagram.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		return this.diagrams.insert(actor, diagram);
	}
	async update(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		if (diagram.userId !== actor.userId)
			throw new OwnershipError('Cannot update another user’s diagram');
		await this.get(actor, diagram.id);
		if (diagram.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, diagram.sourceAnchorId);
			if (!anchor || anchor.noteId !== diagram.sourceNoteId)
				throw new NotFoundError('Diagram source anchor was not found');
		}
		if (diagram.provenanceId && !(await this.provenance.findById(actor, diagram.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		return this.diagrams.update(actor, diagram);
	}
	async delete(actor: ActorContext, diagramId: DiagramId): Promise<void> {
		await this.get(actor, diagramId);
		return this.diagrams.delete(actor, diagramId);
	}
	/** The diagram a studio conversation already produced, if it has been promoted. */
	findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined> {
		return this.diagrams.findByConversation(actor, conversationId);
	}
	/** How many notes render this diagram, for the delete confirmation. */
	async countReferencingNotes(actor: ActorContext, diagramId: DiagramId): Promise<number> {
		await this.get(actor, diagramId);
		return this.diagrams.countReferencingNotes(actor, diagramId);
	}
	/** Retitle a diagram, leaving its source and preview untouched. */
	async rename(actor: ActorContext, diagramId: DiagramId, title: string): Promise<Diagram> {
		const current = await this.get(actor, diagramId);
		return this.diagrams.update(actor, {
			...current,
			title,
			updatedAt: now()
		});
	}
}

export type DiagramFinder = Pick<DiagramLibrary, 'get'>;
export type DiagramLister = Pick<
	DiagramLibrary,
	'listForNote' | 'listForProject' | 'countForProject'
>;
export type DiagramWriter = Pick<DiagramLibrary, 'create' | 'update'>;
export type DiagramDeleter = Pick<DiagramLibrary, 'delete'>;
