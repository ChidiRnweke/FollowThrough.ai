import type { ActorContext, Diagram, DiagramId, NoteId, ProjectId } from '$lib/models';
import { NotFoundError, OwnershipError } from '$lib/models';
import type {
	DiagramRepository,
	NoteRepository,
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/repositories';
import type { DiagramDeleter, DiagramFinder, DiagramLister, DiagramWriter } from './contracts';

export class DiagramManagementService
	implements DiagramFinder, DiagramLister, DiagramWriter, DiagramDeleter
{
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
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Diagram[]> {
		return this.diagrams.listForProject(actor, projectId);
	}
	async create(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		if (diagram.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s diagram');
		if (!(await this.notes.findById(actor, diagram.noteId)))
			throw new NotFoundError('Diagram note was not found');
		if (diagram.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, diagram.sourceAnchorId);
			if (!anchor || anchor.noteId !== diagram.noteId)
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
			if (!anchor || anchor.noteId !== diagram.noteId)
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
}
