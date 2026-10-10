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

const now = (): DateTime => new Date().toISOString() as DateTime;

export interface DiagramFinder {
	get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLister {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<ListProjectDiagramsOutput>;
	countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListProjectDiagramsParams
	): Promise<number>;
}
export interface DiagramWriter {
	create(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	persistContent(actor: ActorContext, write: DiagramContentWrite): Promise<Diagram>;
}
export interface DiagramConversationFinder {
	findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined>;
}
export interface DiagramReferenceCounter {
	countReferencingNotes(actor: ActorContext, diagramId: DiagramId): Promise<number>;
}
export interface DiagramDraftWriter {
	getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
	persistEdit(actor: ActorContext, write: DiagramRevisionWrite): Promise<DrawioDiagram | undefined>;
	recordRevision(actor: ActorContext, diagram: DrawioDiagram): Promise<DiagramRevision>;
}
export interface DiagramRevisionReader {
	revisions(actor: ActorContext, diagramId: DiagramId): Promise<readonly DiagramRevision[]>;
	revision(
		actor: ActorContext,
		diagramId: DiagramId,
		revisionId: DiagramRevisionId
	): Promise<DiagramRevision>;
}
export interface DiagramWriteReader {
	getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
}
export interface DiagramLifecycle {
	getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram>;
	persistTrash(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	deleteArchived(actor: ActorContext, diagramId: DiagramId): Promise<void>;
	listArchived(actor: ActorContext, projectId?: ProjectId): Promise<readonly Diagram[]>;
}
export class DiagramReadingService
	implements
		DiagramFinder,
		DiagramLister,
		DiagramConversationFinder,
		DiagramReferenceCounter,
		DiagramWriteReader
{
	constructor(
		private readonly diagrams: DiagramRepository,
		private readonly notes: NoteRepository
	) {}
	async get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findById(actor, diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	async getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findForWrite(actor, diagramId);
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
	countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	): Promise<number> {
		return this.diagrams.countForProject(actor, projectId, params);
	}
	findByConversation(
		actor: ActorContext,
		conversationId: ConversationId
	): Promise<Diagram | undefined> {
		return this.diagrams.findByConversation(actor, conversationId);
	}
	async countReferencingNotes(actor: ActorContext, diagramId: DiagramId): Promise<number> {
		await this.get(actor, diagramId);
		return this.diagrams.countReferencingNotes(actor, diagramId);
	}
}
export class DiagramWritingService implements DiagramWriter {
	constructor(
		private readonly diagrams: DiagramRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly projects: ProjectRepository
	) {}
	async create(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		if (diagram.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s diagram');
		await this.requireOwnedScope(actor, diagram);
		if (diagram.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, diagram.sourceAnchorId);
			if (!anchor || anchor.noteId !== diagram.sourceNoteId)
				throw new NotFoundError('Diagram source anchor was not found');
		}
		if (diagram.provenanceId && !(await this.provenance.findById(actor, diagram.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		return this.diagrams.insert(actor, diagram);
	}
	async persistContent(actor: ActorContext, write: DiagramContentWrite): Promise<Diagram> {
		if (write.kind === 'mermaid' && !(await this.provenance.findById(actor, write.provenanceId)))
			throw new NotFoundError('Diagram provenance was not found');
		const saved = await this.diagrams.updateContent(actor, write);
		if (!saved)
			throw new StaleRevisionError('The diagram changed before its content could be saved');
		return saved;
	}
	private async requireOwnedScope(actor: ActorContext, diagram: Diagram): Promise<void> {
		if (!(await this.projects.findById(actor, diagram.projectId)))
			throw new NotFoundError('Diagram project was not found');
		if (diagram.sourceNoteId === undefined) return;
		const note = await this.notes.findById(actor, diagram.sourceNoteId);
		if (!note) throw new NotFoundError('Diagram note was not found');
		if (note.projectId !== diagram.projectId)
			throw new ValidationError('The diagram and its source note must belong to the same project');
	}
}
export class DiagramLifecycleService implements DiagramLifecycle {
	constructor(private readonly diagrams: DiagramRepository) {}
	async getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findForWrite(actor, diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	persistTrash(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		return this.diagrams.updateTrash(actor, diagram);
	}
	async deleteArchived(actor: ActorContext, diagramId: DiagramId): Promise<void> {
		if (!(await this.diagrams.deleteArchived(actor, diagramId)))
			throw new StaleRevisionError('The diagram changed before it could be deleted');
	}
	listArchived(actor: ActorContext, projectId?: ProjectId): Promise<readonly Diagram[]> {
		return this.diagrams.listArchived(actor, projectId);
	}
}
export class DiagramRevisionService implements DiagramDraftWriter, DiagramRevisionReader {
	constructor(private readonly diagrams: DiagramRepository) {}
	async getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = await this.diagrams.findForWrite(actor, diagramId);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}
	persistEdit(
		actor: ActorContext,
		write: DiagramRevisionWrite
	): Promise<DrawioDiagram | undefined> {
		return this.diagrams.updateIfRevision(
			actor,
			write.diagram,
			write.expectedRevision,
			write.expectedPublishedRevision
		);
	}
	async recordRevision(actor: ActorContext, diagram: DrawioDiagram): Promise<DiagramRevision> {
		return this.diagrams.insertRevision(actor, {
			id: crypto.randomUUID() as DiagramRevisionId,
			diagramId: diagram.id,
			revision: diagram.currentRevision,
			title: diagram.title,
			source: diagram.source,
			renderedSvg: diagram.renderedSvg,
			searchableText: diagram.searchableText,
			createdAt: now()
		});
	}
	revisions(actor: ActorContext, diagramId: DiagramId): Promise<readonly DiagramRevision[]> {
		return this.diagrams.listRevisions(actor, diagramId);
	}
	async revision(
		actor: ActorContext,
		diagramId: DiagramId,
		revisionId: DiagramRevisionId
	): Promise<DiagramRevision> {
		const revision = await this.diagrams.findRevision(actor, diagramId, revisionId);
		if (!revision) throw new NotFoundError('That version of the diagram is no longer available');
		return revision;
	}
}
