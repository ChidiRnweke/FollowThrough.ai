import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramEtag,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram,
	ListProjectDiagramsOutput,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import { diagramEtag } from '$lib/models/diagrams';
import type { ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import {
	NotFoundError,
	OwnershipError,
	StaleRevisionError,
	UnsupportedDiagramOperationError,
	ValidationError
} from '$lib/errors';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';

export interface DiagramProjectReader {
	get(actor: ActorContext, projectId: ProjectId): Promise<unknown>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

export class DiagramLibrary {
	constructor(
		private readonly diagrams: DiagramRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly projects: DiagramProjectReader
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
		await this.projects.get(actor, diagram.projectId);
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
	private async editable(
		actor: ActorContext,
		diagramId: DiagramId,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram> {
		const current = await this.get(actor, diagramId);
		if (current.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
		if (diagramEtag(current) !== baseEtag)
			throw new StaleRevisionError('The diagram has changed since it was loaded');
		return current;
	}

	private async writeDraft(
		actor: ActorContext,
		current: DrawioDiagram,
		changed: Omit<DrawioDiagram, 'currentRevision'>
	): Promise<DrawioDiagram> {
		const updated = await this.diagrams.updateIfRevision(
			actor,
			{
				...changed,
				currentRevision: current.currentRevision + 1
			},
			current.currentRevision
		);
		if (!updated) throw new StaleRevisionError('The diagram changed while it was being saved');
		return updated;
	}

	async saveDraftSource(
		actor: ActorContext,
		diagramId: DiagramId,
		source: string,
		searchableText: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram> {
		const current = await this.editable(actor, diagramId, baseEtag);
		if (current.source === source) return current;
		return this.writeDraft(actor, current, {
			...current,
			source,
			searchableText,
			updatedAt: now()
		});
	}

	/** Retitle the working draft; publication remains where it was. */
	async rename(
		actor: ActorContext,
		diagramId: DiagramId,
		title: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram> {
		const current = await this.get(actor, diagramId);
		if (current.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
		if (diagramEtag(current) !== baseEtag)
			throw new StaleRevisionError('The diagram has changed since it was loaded');
		const trimmed = title.trim();
		if (!trimmed) throw new ValidationError('Diagram title is required');
		if (current.title === trimmed) return current;
		return this.writeDraft(actor, current, { ...current, title: trimmed, updatedAt: now() });
	}

	async publish(
		actor: ActorContext,
		diagramId: DiagramId,
		source: string,
		renderedSvg: string,
		searchableText: string,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram> {
		const current = await this.editable(actor, diagramId, baseEtag);
		if (
			current.currentRevision === current.publishedRevision &&
			current.source === source &&
			current.renderedSvg === renderedSvg
		)
			throw new ValidationError('The diagram has no unpublished changes');
		const revision =
			current.source === source ? current.currentRevision : current.currentRevision + 1;
		const timestamp = now();
		const published = await this.diagrams.updateIfRevision(
			actor,
			{
				...current,
				source,
				renderedSvg,
				searchableText,
				currentRevision: revision,
				publishedRevision: revision,
				publishedAt: timestamp,
				updatedAt: timestamp
			},
			current.currentRevision
		);
		if (!published)
			throw new StaleRevisionError('The diagram changed while it was being published');
		await this.recordRevision(actor, published);
		return published;
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

	async restore(
		actor: ActorContext,
		diagramId: DiagramId,
		revisionId: DiagramRevisionId,
		baseEtag: DiagramEtag
	): Promise<DrawioDiagram> {
		const [current, revision] = await Promise.all([
			this.editable(actor, diagramId, baseEtag),
			this.revision(actor, diagramId, revisionId)
		]);
		return this.writeDraft(actor, current, {
			...current,
			title: revision.title,
			source: revision.source,
			searchableText: revision.searchableText,
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
export type DiagramDraftWriter = Pick<
	DiagramLibrary,
	'saveDraftSource' | 'rename' | 'publish' | 'recordRevision' | 'restore'
>;
export type DiagramRevisionReader = Pick<DiagramLibrary, 'revisions' | 'revision'>;
