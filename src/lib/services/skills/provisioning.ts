import type {
	ActorContext,
	DateTime,
	Note,
	NoteId,
	NoteRevisionId,
	ProjectId,
	Skill,
	SkillSummary
} from '$lib/models';
import { DEFAULT_PROJECT_NAME, NotFoundError, ValidationError } from '$lib/models';
import type { NoteRepository, ProjectRepository, SkillRepository } from '$lib/repositories';
import type { BuiltInSkillProvisioner, SkillFinder } from './contracts';

interface BuiltInSkillDefinition {
	readonly key: string;
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	readonly triggerHints: readonly string[];
	readonly allowImplicitInvocation: boolean;
}

const BUILT_INS: readonly BuiltInSkillDefinition[] = [
	{
		key: 'followthrough',
		name: 'FollowThrough',
		description: 'Discover and use FollowThrough actions safely.',
		instructions: `Use FollowThrough as an action-oriented workbench.

Discover the available action tools before answering. Prefer read tools to inspect current state, proposal tools for AI-generated suggestions, and mutation tools only when the requested execution mode permits them. Load other skills lazily when their summaries or trigger hints match the request. Keep AI-generated proposals reviewable and preserve provenance.`,
		triggerHints: ['create', 'update', 'organize', 'plan', 'follow through'],
		allowImplicitInvocation: true
	},
	{
		key: 'diagramming',
		name: 'Diagramming',
		description: 'Turn source material into clear, valid Mermaid diagrams.',
		instructions: `Create or revise Mermaid diagrams from the supplied material.

Infer the relationships that matter before choosing a diagram family. Use flowcharts for processes and dependency maps, sequence diagrams for ordered interactions, state diagrams for lifecycle transitions, class diagrams for stable structures, and other Mermaid families only when they communicate the material more clearly.

Preserve uncertainty and do not invent systems, people, steps, or dependencies that the source does not support. Prefer a small coherent diagram over an exhaustive one. Use concise, readable labels and stable identifiers. When revising, preserve correct information and change only what the instruction requires.

Inspect relevant project notes, memories, profile context, or attachments when they are available and useful. Finish by calling submit_mermaid_diagram exactly once with valid Mermaid source and an optional concise title. Do not wrap the source in Markdown fences and do not use click handlers, links, initialization directives, or HTML labels.`,
		triggerHints: ['diagram', 'mermaid', 'visualize', 'flowchart', 'sequence', 'architecture'],
		allowImplicitInvocation: false
	}
];

const now = (): DateTime => new Date().toISOString() as DateTime;

export class DefaultBuiltInSkillProvisioner implements BuiltInSkillProvisioner {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly notes: NoteRepository,
		private readonly skills: SkillRepository
	) {}

	async ensure(actor: ActorContext): Promise<void> {
		const projects = await this.projects.listActive(actor);
		const defaultProject =
			projects.find((candidate) => candidate.name === DEFAULT_PROJECT_NAME) ??
			(await this.projects.insert(actor, { name: DEFAULT_PROJECT_NAME }));
		const activeProjectIds = new Set(projects.map((project) => project.id));
		activeProjectIds.add(defaultProject.id);
		for (const definition of BUILT_INS)
			await this.ensureDefinition(actor, definition, defaultProject.id, activeProjectIds);
	}

	async load(actor: ActorContext, key: string): Promise<Skill> {
		await this.ensure(actor);
		const note = await this.notes.findByBuiltInKey(actor, key);
		if (!note) throw new NotFoundError(`Built-in skill "${key}" was not found`);
		const skill = await this.skills.findByNoteId(actor, note.id);
		if (!skill) throw new NotFoundError(`Built-in skill "${key}" is incomplete`);
		if (!skill.isEnabled)
			throw new ValidationError(
				`The ${skill.name} skill is disabled. Re-enable it in Skills first.`
			);
		return skill;
	}

	private async ensureDefinition(
		actor: ActorContext,
		definition: BuiltInSkillDefinition,
		defaultProjectId: ProjectId,
		activeProjectIds: ReadonlySet<ProjectId>
	): Promise<void> {
		let note = await this.notes.findByBuiltInKey(actor, definition.key);
		if (!note && definition.key === 'followthrough') {
			const active = await this.notes.listActive(actor);
			note = active.find(
				(candidate) =>
					candidate.kind === 'skill' && candidate.title.toLocaleLowerCase() === 'followthrough'
			);
		}
		if (!note) note = await this.createNote(actor, definition, defaultProjectId);
		else {
			const repaired: Note = {
				...note,
				projectId: activeProjectIds.has(note.projectId) ? note.projectId : defaultProjectId,
				kind: 'skill',
				builtInKey: definition.key,
				archivedAt: undefined,
				updatedAt: note.updatedAt
			};
			if (
				repaired.projectId !== note.projectId ||
				repaired.kind !== note.kind ||
				repaired.builtInKey !== note.builtInKey ||
				note.archivedAt !== undefined
			)
				note = await this.notes.update(actor, repaired);
		}
		if (await this.skills.findByNoteId(actor, note.id)) return;
		await this.skills.insert(actor, this.toSkill(note, definition));
	}

	private async createNote(
		actor: ActorContext,
		definition: BuiltInSkillDefinition,
		projectId: ProjectId
	): Promise<Note> {
		const timestamp = now();
		const note = await this.notes.insert(actor, {
			id: crypto.randomUUID() as NoteId,
			userId: actor.userId,
			projectId,
			kind: 'skill',
			position: await this.notes.countSiblings(actor, projectId),
			title: definition.name,
			builtInKey: definition.key,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: definition.instructions }] }]
			},
			plainText: definition.instructions,
			currentRevision: 1,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: note.id,
			revision: 1,
			title: note.title,
			document: note.document,
			plainText: note.plainText,
			createdAt: timestamp
		});
		return note;
	}

	private toSkill(note: Note, definition: BuiltInSkillDefinition): Skill {
		return {
			note,
			name: definition.name,
			slug: definition.key,
			description: definition.description,
			triggerHints: definition.triggerHints,
			metadata: { 'followthrough.built-in': 'true', 'followthrough.built-in-key': definition.key },
			allowImplicitInvocation: definition.allowImplicitInvocation,
			isEnabled: true
		};
	}
}

export class ProvisioningSkillFinder implements SkillFinder {
	constructor(
		private readonly provisioner: BuiltInSkillProvisioner,
		private readonly delegate: SkillFinder
	) {}

	async listEnabled(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		await this.provisioner.ensure(actor);
		return this.delegate.listEnabled(actor, projectId);
	}

	async listAll(actor: ActorContext, projectId?: ProjectId): Promise<readonly SkillSummary[]> {
		await this.provisioner.ensure(actor);
		return this.delegate.listAll(actor, projectId);
	}

	load(actor: ActorContext, noteId: NoteId): Promise<Skill> {
		return this.delegate.load(actor, noteId);
	}
}
