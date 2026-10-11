import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramContentWrite,
	DiagramRevisionWrite,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, OwnershipError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';

export interface DiagramFinder {
	get(diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLister {
	listForNote(noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput>;
	countForProject(projectId: ProjectId, params?: ListProjectDiagramsParams): Promise<number>;
}
export interface DiagramWriter {
	create(diagram: Diagram): Promise<Diagram>;
	persistContent(write: DiagramContentWrite): Promise<Diagram>;
}
export interface DiagramConversationFinder {
	findByConversation(conversationId: ConversationId): Promise<Diagram | undefined>;
}
export interface DiagramReferenceCounter {
	countReferencingNotes(diagramId: DiagramId): Promise<number>;
}
export interface DiagramDraftWriter {
	getForWrite(diagramId: DiagramId): Promise<Diagram>;
	persistEdit(write: DiagramRevisionWrite): Promise<DrawioDiagram | undefined>;
	recordRevision(diagram: DrawioDiagram): Promise<DiagramRevision>;
}
export interface DiagramRevisionReader {
	revisions(diagramId: DiagramId): Promise<readonly DiagramRevision[]>;
	revision(diagramId: DiagramId, revisionId: DiagramRevisionId): Promise<DiagramRevision>;
}
export interface DiagramWriteReader {
	getForWrite(diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLifecycle {
	getForWrite(diagramId: DiagramId): Promise<Diagram>;
	persistTrash(diagram: Diagram): Promise<Diagram>;
	deleteArchived(diagramId: DiagramId): Promise<void>;
	listArchived(projectId?: ProjectId): Promise<readonly Diagram[]>;
}
/** Every diagram record operation, for a controller that works across all of them. */
export interface DiagramLibrary
	extends
		DiagramFinder,
		DiagramLister,
		DiagramWriter,
		DiagramConversationFinder,
		DiagramReferenceCounter,
		DiagramDraftWriter,
		DiagramRevisionReader,
		DiagramWriteReader,
		DiagramLifecycle {}
/** The user's diagrams: reads, scoped creation, content and draft writes, revisions and trash. */
export class DiagramLibraryService implements DiagramLibrary {
	constructor(
		private readonly actor: ActorContext,
		private readonly diagrams: DiagramRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly projects: ProjectRepository,
		private readonly now: () => DateTime
	) {}
	async get(diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findById(diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	async getForWrite(diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findForWrite(diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	async listForNote(noteId: NoteId): Promise<readonly Diagram[]> {
		if (!(await this.notes.findById(noteId))) throw new NotFoundError('Note was not found');
		return this.diagrams.listForNote(noteId);
	}
	listForProject(
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput> {
		return this.diagrams.listForProject(projectId, params);
	}
	countForProject(projectId: ProjectId, params: ListProjectDiagramsParams = {}): Promise<number> {
		return this.diagrams.countForProject(projectId, params);
	}
	findByConversation(conversationId: ConversationId): Promise<Diagram | undefined> {
		return this.diagrams.findByConversation(conversationId);
	}
	async countReferencingNotes(diagramId: DiagramId): Promise<number> {
		await this.get(diagramId);
		return this.diagrams.countReferencingNotes(diagramId);
	}
	async create(diagram: Diagram): Promise<Diagram> {
		if (diagram.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s diagram');
		await this.requireOwnedScope(diagram);
		if (diagram.sourceAnchorId) {
			const anchor = await this.anchors.findById(diagram.sourceAnchorId);
			if (!anchor || anchor.noteId !== diagram.sourceNoteId)
				throw new NotFoundError('Diagram source anchor was not found');
		}
		if (diagram.provenanceId && !(await this.provenance.findById(diagram.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		return this.diagrams.insert(diagram);
	}
	async persistContent(write: DiagramContentWrite): Promise<Diagram> {
		if (write.kind === 'mermaid' && !(await this.provenance.findById(write.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		const saved = await this.diagrams.updateContent(write);
		if (!saved)
			throw new StaleRevisionError('The diagram changed before its content could be saved');
		return saved;
	}
	persistEdit(write: DiagramRevisionWrite): Promise<DrawioDiagram | undefined> {
		return this.diagrams.updateIfRevision(
			write.diagram,
			write.expectedRevision,
			write.expectedPublishedRevision
		);
	}
	async recordRevision(diagram: DrawioDiagram): Promise<DiagramRevision> {
		return this.diagrams.insertRevision({
			id: crypto.randomUUID() as DiagramRevisionId,
			diagramId: diagram.id,
			revision: diagram.currentRevision,
			title: diagram.title,
			source: diagram.source,
			renderedSvg: diagram.renderedSvg,
			searchableText: diagram.searchableText,
			createdAt: this.now()
		});
	}
	revisions(diagramId: DiagramId): Promise<readonly DiagramRevision[]> {
		return this.diagrams.listRevisions(diagramId);
	}
	async revision(diagramId: DiagramId, revisionId: DiagramRevisionId): Promise<DiagramRevision> {
		const revision = await this.diagrams.findRevision(diagramId, revisionId);
		if (!revision) throw new NotFoundError('That version of the diagram is no longer available');
		return revision;
	}
	persistTrash(diagram: Diagram): Promise<Diagram> {
		return this.diagrams.updateTrash(diagram);
	}
	async deleteArchived(diagramId: DiagramId): Promise<void> {
		if (!(await this.diagrams.deleteArchived(diagramId)))
			throw new StaleRevisionError('The diagram changed before it could be deleted');
	}
	listArchived(projectId?: ProjectId): Promise<readonly Diagram[]> {
		return this.diagrams.listArchived(projectId);
	}
	private async requireOwnedScope(diagram: Diagram): Promise<void> {
		if (!(await this.projects.findById(diagram.projectId)))
			throw new NotFoundError('Diagram project was not found');
		if (diagram.sourceNoteId === undefined) return;
		const note = await this.notes.findById(diagram.sourceNoteId);
		if (!note) throw new NotFoundError('Diagram note was not found');
		if (note.projectId !== diagram.projectId)
			throw new ValidationError('The diagram and its source note must belong to the same project');
	}
}
