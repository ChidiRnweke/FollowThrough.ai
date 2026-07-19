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
	readonly version?: string;
}

const FOLLOWTHROUGH_V1: BuiltInSkillDefinition = {
	key: 'followthrough',
	name: 'FollowThrough',
	description: 'Discover and use FollowThrough actions safely.',
	instructions: `Use FollowThrough as an action-oriented workbench.

Discover the available action tools before answering. Prefer read tools to inspect current state, proposal tools for AI-generated suggestions, and mutation tools only when the requested execution mode permits them. Load other skills lazily when their summaries or trigger hints match the request. Keep AI-generated proposals reviewable and preserve provenance.`,
	triggerHints: ['create', 'update', 'organize', 'plan', 'follow through'],
	allowImplicitInvocation: true
};

const FOLLOWTHROUGH_V2: BuiltInSkillDefinition = {
	key: 'followthrough',
	name: 'FollowThrough',
	description:
		'Guide to FollowThrough features, terminology, navigation, workflows, and agent actions.',
	instructions: `# FollowThrough guide

Use this guide to explain the product, interpret FollowThrough terminology, navigate the workspace, and help the user choose or carry out the right workflow. For general product questions, answer from this guide. For questions about the user's actual workspace, inspect current data before answering.

## Product model

FollowThrough is a connected workbench for turning source material into durable knowledge, commitments, and deliverables.

- **Projects** organize notes, folders, todos, memory, attachments, and generated artifacts around an outcome.
- **Notes** are the authored source of truth. They contain rich text and can connect to todos, references, relationships, diagrams, and AI suggestions.
- **Todos** are explicit commitments. They can belong to the user or be marked as waiting on someone, carry dates and status, and link back to their source note.
- **Memory** is durable context shared with the agent. Profile memory describes the user across projects; project memory records project-specific facts, decisions, constraints, terminology, and preferences. Memory changes are proposed for review rather than silently rewritten.
- **Suggestions** are reviewable AI-produced changes. Depending on the workflow and trust policy, they can be accepted, rejected, reverted, or sometimes auto-accepted while remaining visibly AI-originated.
- **Provenance** records where AI-produced work came from, including its source selection, run, model, and pipeline.
- **Skills** are reusable methods and instructions. Their summaries are advertised first; full instructions load only when relevant. Skills can be enabled, disabled, versioned, and pinned to projects.
- **Attachments** are uploaded project or note resources. Parsed content can be searched, while the original file remains downloadable.
- **Diagrams** can start as Mermaid and, after review, become editable draw.io diagrams.
- **Artifacts** are generated deliverables such as PDF or DOCX files. They can be downloaded, regenerated, or removed without changing their source notes.
- **Execution mode** controls whether agent mutations require approval or can run immediately. **Trust policies** separately control auto-acceptance for specific proposal pipelines.

## Where work happens

- **Today** at "/" is the daily triage view for overdue work, work due today, waiting-on items, pinned notes, and recent notes.
- **Projects** are opened from the sidebar at "/projects/{projectId}". A project hub contains its note tree and links to project Todos, Memory, Attachments, and Artifacts.
- **Notes** live at "/notes/{noteId}". Use the editor for source material and the selection actions to extract promises, find relationships or references, create diagrams, or turn a method into a skill. Note changes autosave; publishing records a durable revision.
- **Todos** at "/todos" show commitments across projects. Project-specific todos live at "/projects/{projectId}/todos". Use them to review status, due dates, responsibility, waiting-on parties, and source notes.
- **Profile** at "/profile" manages cross-project user memory. Project memory lives at "/projects/{projectId}/memory".
- **Attachments** live at "/projects/{projectId}/attachments". Upload source files there when they should be searchable without becoming authored notes.
- **Artifacts** live at "/artifacts", optionally filtered by project. Use them for generated deliverables and their downloads.
- **Skills** at "/skills" list reusable methods; "/skills/{noteId}" shows a skill's instructions, resources, versions, settings, and usage history.
- **Chats** at "/chats", "/chats/new", and "/chats/{conversationId}" provide durable conversations. A chat can originate from a project or note and can carry additional context.
- **Settings** at "/settings" controls agent defaults, execution mode, and pipeline-specific trust policies.

## Agent operating workflow

1. Use get_workspace_context to discover projects, note IDs, enabled skills, and pending work when the relevant identity or location is unknown.
2. Use get_note when a known note's authoritative content and related items matter.
3. Use list_todos, user or project memory, and semantic search when those sources could ground the answer. Prefer parallel independent reads and focused follow-up searches.
4. Load an advertised skill when its method applies.
5. For any capability not already available, call search_tools with the concrete goal. Read the returned schema and call use_tool with the exact name and a matching payload. Never guess tool names or inputs.
6. Inspect before changing. Keep proposals reviewable, respect approval requirements for mutations, and explain failures or rejected actions.

When advising the user, name both the place in the interface and what the agent can help do. Distinguish existing workspace facts from general product guidance. Do not claim that a feature, route, or action exists unless this guide or the available tools support it.

## Common workflows

- **Set up a project:** create or open the project, organize source notes and folders, add attachments, record durable constraints in project memory, and track commitments as todos.
- **Turn notes into action:** read or select the relevant passage, extract proposed promises, review them, and manage accepted work from the global or project todo view.
- **Recover prior knowledge:** inspect the workspace, search semantically, read the strongest source notes, and combine those findings with applicable memory.
- **Reuse a method:** capture stable instructions as a skill, add resources when needed, and pin it to projects where it should be preferred.
- **Produce a deliverable:** select the source notes, generate a PDF or DOCX artifact, then manage the resulting file from Artifacts.`,
	triggerHints: [
		'FollowThrough',
		'how to',
		'where',
		'help',
		'workflow',
		'project',
		'note',
		'todo',
		'memory',
		'suggestion',
		'provenance',
		'skill',
		'chat',
		'attachment',
		'artifact',
		'export'
	],
	allowImplicitInvocation: true,
	version: '2'
};

const BUILT_INS: readonly BuiltInSkillDefinition[] = [
	FOLLOWTHROUGH_V2,
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
		let adoptedLegacy = false;
		if (!note && definition.key === 'followthrough') {
			const active = await this.notes.listActive(actor);
			note = active.find(
				(candidate) =>
					candidate.kind === 'skill' && candidate.title.toLocaleLowerCase() === 'followthrough'
			);
			adoptedLegacy = note !== undefined;
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
		const existing = await this.skills.findByNoteId(actor, note.id);
		if (!existing) {
			await this.skills.insert(
				actor,
				adoptedLegacy
					? {
							...this.toSkill(note, definition),
							metadata: {
								...this.metadata(definition),
								'followthrough.adopted-legacy': 'true'
							}
						}
					: this.toSkill(note, definition)
			);
			return;
		}
		if (adoptedLegacy) {
			await this.skills.update(actor, {
				...existing,
				note,
				metadata: {
					...(existing.metadata ?? {}),
					'followthrough.adopted-legacy': 'true'
				}
			});
			return;
		}
		if (definition.key === 'followthrough' && this.isUntouchedFollowThroughV1(note, existing))
			await this.upgradeFollowThrough(actor, note, existing, definition);
	}

	private isUntouchedFollowThroughV1(note: Note, skill: Skill): boolean {
		const metadata = skill.metadata ?? {};
		return (
			note.title === FOLLOWTHROUGH_V1.name &&
			note.plainText === FOLLOWTHROUGH_V1.instructions &&
			note.currentRevision === 1 &&
			note.publishedRevision === 0 &&
			note.publishedAt === undefined &&
			skill.name === FOLLOWTHROUGH_V1.name &&
			skill.slug === FOLLOWTHROUGH_V1.key &&
			skill.description === FOLLOWTHROUGH_V1.description &&
			skill.allowImplicitInvocation === FOLLOWTHROUGH_V1.allowImplicitInvocation &&
			this.sameStrings(skill.triggerHints, FOLLOWTHROUGH_V1.triggerHints) &&
			Object.keys(metadata).length === 2 &&
			metadata['followthrough.built-in'] === 'true' &&
			metadata['followthrough.built-in-key'] === FOLLOWTHROUGH_V1.key
		);
	}

	private sameStrings(left: readonly string[], right: readonly string[]): boolean {
		return left.length === right.length && left.every((value, index) => value === right[index]);
	}

	private async upgradeFollowThrough(
		actor: ActorContext,
		note: Note,
		skill: Skill,
		definition: BuiltInSkillDefinition
	): Promise<void> {
		const timestamp = now();
		const updated = await this.notes.update(actor, {
			...note,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: definition.instructions }] }]
			},
			plainText: definition.instructions,
			currentRevision: note.currentRevision + 1,
			updatedAt: timestamp
		});
		await this.notes.insertRevision(actor, {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: updated.id,
			revision: updated.currentRevision,
			title: updated.title,
			document: updated.document,
			plainText: updated.plainText,
			createdAt: timestamp
		});
		await this.skills.update(actor, {
			...skill,
			note: updated,
			name: definition.name,
			slug: definition.key,
			description: definition.description,
			triggerHints: definition.triggerHints,
			metadata: this.metadata(definition),
			allowImplicitInvocation: definition.allowImplicitInvocation
		});
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
			publishedRevision: 0,
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
			metadata: this.metadata(definition),
			allowImplicitInvocation: definition.allowImplicitInvocation,
			isEnabled: true
		};
	}

	private metadata(definition: BuiltInSkillDefinition): Readonly<Record<string, string>> {
		return {
			'followthrough.built-in': 'true',
			'followthrough.built-in-key': definition.key,
			...(definition.version ? { 'followthrough.built-in-version': definition.version } : {})
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
