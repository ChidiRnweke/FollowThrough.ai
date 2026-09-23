import type { Note } from '$lib/models/notes';
import { ConflictError, NotFoundError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type {
	Diagram,
	DiagramContentWrite,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram,
	ListProjectDiagramsParams
} from '$lib/models/diagrams';
import type { ExternalReference, ReferenceId } from '$lib/models/references';
import type { NoteId, NoteRelationship } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { RelationshipId } from '$lib/models/relationships';
import type { Skill, SkillSummary, SkillUsage } from '$lib/models/skills';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRelationshipRepository } from '$lib/server/repositories/relationships/relationships';
import type { ReferenceRepository } from '$lib/server/repositories/references/references';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';
import type { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';

export class InMemoryRelationshipRepository implements NoteRelationshipRepository {
	relationships: NoteRelationship[] = [];
	async findById(actor: ActorContext, id: RelationshipId) {
		return this.relationships.find((item) => item.id === id && item.userId === actor.userId);
	}
	async listForNote(actor: ActorContext, noteId: NoteId) {
		return this.relationships.filter(
			(item) =>
				item.userId === actor.userId &&
				(item.sourceNoteId === noteId || item.targetNoteId === noteId)
		);
	}

	async insert(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship> {
		if (
			this.relationships.some(
				(item) =>
					item.id === relationship.id ||
					(item.sourceNoteId === relationship.sourceNoteId &&
						item.targetNoteId === relationship.targetNoteId &&
						item.kind === relationship.kind)
			)
		)
			throw new ConflictError('Relationship already exists');
		const stored = { ...relationship, userId: actor.userId };
		this.relationships.push(stored);
		return stored;
	}
	async findForWrite(
		actor: ActorContext,
		relationship: Pick<NoteRelationship, 'sourceNoteId' | 'targetNoteId' | 'kind'>
	): Promise<NoteRelationship | undefined> {
		return this.relationships.find(
			(item) =>
				item.userId === actor.userId &&
				item.sourceNoteId === relationship.sourceNoteId &&
				item.targetNoteId === relationship.targetNoteId &&
				item.kind === relationship.kind
		);
	}
	async update(actor: ActorContext, relationship: NoteRelationship): Promise<NoteRelationship> {
		const current = await this.findById(actor, relationship.id);
		if (!current) throw new NotFoundError('Relationship was not found');
		const updated = {
			...current,
			justification: relationship.justification,
			updatedAt: relationship.updatedAt
		};
		this.relationships = this.relationships.map((item) =>
			item.id === current.id ? updated : item
		);
		return updated;
	}

	async delete(actor: ActorContext, id: RelationshipId) {
		this.relationships = this.relationships.filter(
			(item) => item.id !== id || item.userId !== actor.userId
		);
	}
}

export class InMemoryReferenceRepository implements ReferenceRepository {
	references: ExternalReference[] = [];
	async listForNote(actor: ActorContext, noteId: NoteId) {
		return this.references.filter((item) => item.noteId === noteId && item.userId === actor.userId);
	}
	async insert(_actor: ActorContext, reference: ExternalReference) {
		this.references.push(reference);
		return reference;
	}
	async delete(actor: ActorContext, id: ReferenceId) {
		this.references = this.references.filter(
			(item) => item.id !== id || item.userId !== actor.userId
		);
	}
}

export class InMemoryDiagramRepository implements DiagramRepository {
	diagrams: Diagram[] = [];
	diagramRevisions: DiagramRevision[] = [];
	snapshot(): () => void {
		const diagrams = structuredClone(this.diagrams);
		const revisions = structuredClone(this.diagramRevisions);
		return () => {
			this.diagrams = diagrams;
			this.diagramRevisions = revisions;
		};
	}
	/** Notes whose document renders a diagram, keyed by diagram id. */
	referencingNotes = new Map<DiagramId, number>();
	async findForWrite(actor: ActorContext, id: DiagramId) {
		return this.findById(actor, id);
	}
	async findById(actor: ActorContext, id: DiagramId) {
		return this.diagrams.find((item) => item.id === id && item.userId === actor.userId);
	}
	async findByConversation(actor: ActorContext, conversationId: ConversationId) {
		return this.diagrams.find(
			(item) =>
				item.conversationId === conversationId &&
				item.userId === actor.userId &&
				item.archivedAt === undefined
		);
	}
	async countReferencingNotes(_actor: ActorContext, id: DiagramId) {
		return this.referencingNotes.get(id) ?? 0;
	}
	async listForNote(actor: ActorContext, noteId: NoteId) {
		return this.diagrams.filter(
			(item) =>
				item.sourceNoteId === noteId &&
				item.userId === actor.userId &&
				item.archivedAt === undefined
		);
	}
	async countForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	) {
		return (await this.listForProject(actor, projectId, params)).total;
	}
	async listForProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListProjectDiagramsParams = {}
	) {
		const term = params.query?.trim().toLowerCase();
		const matched = this.diagrams.filter(
			(item) =>
				item.userId === actor.userId &&
				item.projectId === projectId &&
				item.archivedAt === undefined &&
				(!params.kind || item.kind === params.kind) &&
				(!term ||
					(item.title ?? '').toLowerCase().includes(term) ||
					item.searchableText.toLowerCase().includes(term))
		);
		const offset = params.offset ?? 0;
		const page =
			params.limit === undefined
				? matched.slice(offset)
				: matched.slice(offset, offset + params.limit);
		return { diagrams: page, total: matched.length };
	}
	async insert(_actor: ActorContext, diagram: Diagram) {
		this.diagrams.push(diagram);
		return diagram;
	}
	async updateContent(
		actor: ActorContext,
		write: DiagramContentWrite
	): Promise<Diagram | undefined> {
		const current = this.diagrams.find(
			(item) => item.id === write.diagramId && item.userId === actor.userId
		);
		if (
			!current ||
			current.kind !== write.kind ||
			current.archivedAt ||
			current.updatedAt !== write.expectedUpdatedAt ||
			(write.kind === 'drawio' &&
				(current.kind !== 'drawio' ||
					current.currentRevision !== write.expectedRevision ||
					current.publishedRevision !== write.expectedPublishedRevision))
		)
			return undefined;
		const saved: Diagram = {
			...current,
			source: write.source,
			renderedSvg: write.renderedSvg,
			searchableText: write.searchableText,
			updatedAt: write.updatedAt,
			...(write.kind === 'mermaid' ? { title: write.title, provenanceId: write.provenanceId } : {})
		};
		this.diagrams = this.diagrams.map((item) => (item.id === saved.id ? saved : item));
		return saved;
	}
	async updateIfRevision(
		_actor: ActorContext,
		diagram: DrawioDiagram,
		expected: number,
		expectedPublishedRevision: number
	) {
		const current = this.diagrams.find((item) => item.id === diagram.id);
		if (
			!current ||
			current.userId !== _actor.userId ||
			current.archivedAt ||
			current.kind !== 'drawio' ||
			current.currentRevision !== expected ||
			current.publishedRevision !== expectedPublishedRevision
		)
			return undefined;
		this.diagrams = this.diagrams.map((item) => (item.id === diagram.id ? diagram : item));
		return diagram;
	}
	async insertRevision(_actor: ActorContext, revision: DiagramRevision) {
		const existing = this.diagramRevisions.find(
			(item) => item.diagramId === revision.diagramId && item.revision === revision.revision
		);
		if (existing) return existing;
		this.diagramRevisions.push(revision);
		return revision;
	}
	async listRevisions(_actor: ActorContext, id: DiagramId) {
		return this.diagramRevisions.filter((revision) => revision.diagramId === id).reverse();
	}
	async findRevision(_actor: ActorContext, id: DiagramId, revisionId: DiagramRevisionId) {
		return this.diagramRevisions.find(
			(revision) => revision.diagramId === id && revision.id === revisionId
		);
	}
	async updateTrash(actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		const index = this.diagrams.findIndex(
			(item) => item.id === diagram.id && item.userId === actor.userId
		);
		if (index === -1) throw new NotFoundError('Diagram was not found', { diagramId: diagram.id });
		const { archivedAt, ...current } = this.diagrams[index]!;
		void archivedAt;
		const updated = {
			...current,
			updatedAt: diagram.updatedAt,
			...(diagram.archivedAt === undefined ? {} : { archivedAt: diagram.archivedAt })
		};
		this.diagrams[index] = updated;
		return updated;
	}

	async listArchived(actor: ActorContext, projectId?: ProjectId): Promise<readonly Diagram[]> {
		return this.diagrams.filter(
			(diagram) =>
				diagram.userId === actor.userId &&
				diagram.archivedAt !== undefined &&
				(projectId === undefined || diagram.projectId === projectId)
		);
	}

	async deleteArchived(actor: ActorContext, id: DiagramId): Promise<boolean> {
		const eligible = this.diagrams.find(
			(item) => item.id === id && item.userId === actor.userId && item.archivedAt !== undefined
		);
		if (!eligible) return false;
		this.diagrams = this.diagrams.filter((item) => item.id !== id || item.userId !== actor.userId);
		this.diagramRevisions = this.diagramRevisions.filter((revision) => revision.diagramId !== id);
		return true;
	}
}

export class InMemorySkillRepository implements SkillRepository {
	constructor(private readonly notes: InMemoryNoteRepository) {}
	writeFailure: Error | undefined;
	// Unit transactions run sequentially; PostgreSQL contracts verify concurrent locking.
	async lockBuiltInProvisioning(_actor: ActorContext): Promise<void> {}
	snapshot(): () => void {
		const skills = structuredClone(this.skills);
		const usages = structuredClone(this.usages);
		return () => {
			this.skills = skills;
			this.usages = usages;
		};
	}
	skills: Skill<Note>[] = [];
	usages: SkillUsage[] = [];
	findForWrite(actor: ActorContext, noteId: NoteId): Promise<Skill<Note> | undefined> {
		return this.findByNoteId(actor, noteId);
	}
	async findByNoteId(actor: ActorContext, noteId: NoteId) {
		const skill = this.skills.find((item) => item.note.id === noteId);
		const note = await this.notes.findById(actor, noteId);
		return skill && note ? { ...skill, note } : undefined;
	}
	async listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		return (await this.listAll(actor)).filter((skill) => skill.isEnabled);
	}
	async listAll(actor: ActorContext): Promise<readonly SkillSummary[]> {
		const joined = await Promise.all(
			this.skills.map((item) => this.findByNoteId(actor, item.note.id))
		);
		return joined
			.filter((item) => item !== undefined)
			.map((item) => ({
				noteId: item.note.id,
				projectId: item.note.projectId,
				name: item.note.title,
				slug: item.slug,
				description: item.description,
				triggerHints: item.triggerHints,
				allowImplicitInvocation: item.allowImplicitInvocation,
				isEnabled: item.isEnabled
			}));
	}
	async insert(actor: ActorContext, skill: Skill<Note>) {
		if (this.writeFailure) throw this.writeFailure;
		const note = await this.notes.findById(actor, skill.note.id);
		if (!note) throw new NotFoundError('Skill note was not found');
		if (this.skills.some((current) => current.note.id === note.id))
			throw new ConflictError('Skill metadata already exists');
		const stored = { ...skill, note };
		this.skills.push(stored);
		return stored;
	}
	async update(actor: ActorContext, skill: Skill<Note>) {
		if (this.writeFailure) throw this.writeFailure;
		const note = await this.notes.findById(actor, skill.note.id);
		if (!note) throw new NotFoundError('Skill note was not found');
		if (!this.skills.some((current) => current.note.id === note.id))
			throw new NotFoundError('Skill was not found');
		const stored = { ...skill, note };
		this.skills = this.skills.map((item) => (item.note.id === note.id ? stored : item));
		return stored;
	}
	async setPinned(): Promise<void> {}
	async recordUsage(_actor: ActorContext, usage: SkillUsage) {
		this.usages.push(usage);
		return usage;
	}
	async listUsages(_actor: ActorContext, noteId: NoteId) {
		return this.usages.filter((item) => item.skillNoteId === noteId);
	}
}
