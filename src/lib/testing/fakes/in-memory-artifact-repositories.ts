import type {
	ActorContext,
	Diagram,
	DiagramId,
	ExternalReference,
	NoteId,
	NoteRelationship,
	ProjectId,
	ReferenceId,
	RelationshipId,
	Skill,
	SkillSummary,
	SkillUsage
} from '$lib/models';
import type {
	DiagramRepository,
	NoteRelationshipRepository,
	ReferenceRepository,
	SkillRepository
} from '$lib/repositories';

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
	projectIds = new Map<DiagramId, ProjectId>();
	async findById(actor: ActorContext, id: DiagramId) {
		return this.diagrams.find((item) => item.id === id && item.userId === actor.userId);
	}
	async listForNote(actor: ActorContext, noteId: NoteId) {
		return this.diagrams.filter((item) => item.noteId === noteId && item.userId === actor.userId);
	}
	async listForProject(actor: ActorContext, projectId: ProjectId) {
		return this.diagrams.filter(
			(item) => item.userId === actor.userId && this.projectIds.get(item.id) === projectId
		);
	}
	async insert(_actor: ActorContext, diagram: Diagram) {
		this.diagrams.push(diagram);
		return diagram;
	}
	async update(_actor: ActorContext, diagram: Diagram) {
		this.diagrams = this.diagrams.map((item) => (item.id === diagram.id ? diagram : item));
		return diagram;
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
		return this.skills
			.filter((item) => item.note.userId === actor.userId && item.isEnabled)
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
	async recordUsage(_actor: ActorContext, usage: SkillUsage) {
		this.usages.push(usage);
		return usage;
	}
	async listUsages(_actor: ActorContext, noteId: NoteId) {
		return this.usages.filter((item) => item.skillNoteId === noteId);
	}
}
