import type { ActorContext } from '$lib/models/identity';
import type { ConversationId } from '$lib/models/agent';
import type {
	Diagram,
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
	async insert(_actor: ActorContext, relationship: NoteRelationship) {
		this.relationships.push(relationship);
		return relationship;
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
	/** Notes whose document renders a diagram, keyed by diagram id. */
	referencingNotes = new Map<DiagramId, number>();
	async findById(actor: ActorContext, id: DiagramId) {
		return this.diagrams.find((item) => item.id === id && item.userId === actor.userId);
	}
	async findByConversation(actor: ActorContext, conversationId: ConversationId) {
		return this.diagrams.find(
			(item) => item.conversationId === conversationId && item.userId === actor.userId
		);
	}
	async countReferencingNotes(_actor: ActorContext, id: DiagramId) {
		return this.referencingNotes.get(id) ?? 0;
	}
	async listForNote(actor: ActorContext, noteId: NoteId) {
		return this.diagrams.filter(
			(item) => item.sourceNoteId === noteId && item.userId === actor.userId
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
	async update(_actor: ActorContext, diagram: Diagram) {
		this.diagrams = this.diagrams.map((item) => (item.id === diagram.id ? diagram : item));
		return diagram;
	}
	async updateIfRevision(_actor: ActorContext, diagram: DrawioDiagram, expected: number) {
		const current = this.diagrams.find((item) => item.id === diagram.id);
		if (!current || current.kind !== 'drawio' || current.currentRevision !== expected)
			return undefined;
		await this.update(_actor, diagram);
		return diagram;
	}
	async insertRevision(_actor: ActorContext, revision: DiagramRevision) {
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
	async delete(actor: ActorContext, id: DiagramId) {
		this.diagrams = this.diagrams.filter((item) => item.id !== id || item.userId !== actor.userId);
	}
}

export class InMemorySkillRepository implements SkillRepository {
	skills: Skill[] = [];
	usages: SkillUsage[] = [];
	async findByNoteId(actor: ActorContext, noteId: NoteId) {
		return this.skills.find((item) => item.note.id === noteId && item.note.userId === actor.userId);
	}
	async listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		return (await this.listAll(actor)).filter((skill) => skill.isEnabled);
	}
	async listAll(actor: ActorContext): Promise<readonly SkillSummary[]> {
		return this.skills
			.filter((item) => item.note.userId === actor.userId)
			.map((item) => ({
				noteId: item.note.id,
				name: item.name,
				description: item.description,
				triggerHints: item.triggerHints,
				isEnabled: item.isEnabled
			}));
	}
	async insert(_actor: ActorContext, skill: Skill) {
		this.skills.push(skill);
		return skill;
	}
	async update(_actor: ActorContext, skill: Skill) {
		this.skills = this.skills.map((item) => (item.note.id === skill.note.id ? skill : item));
		return skill;
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
