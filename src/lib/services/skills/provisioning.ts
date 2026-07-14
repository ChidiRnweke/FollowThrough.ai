import type {
	ActorContext,
	DateTime,
	NoteId,
	NoteRevisionId,
	ProjectId,
	Skill,
	SkillSummary
} from '$lib/models';
import { DEFAULT_PROJECT_NAME } from '$lib/models';
import type { NoteRepository, ProjectRepository, SkillRepository } from '$lib/repositories';
import type { BuiltInSkillProvisioner, SkillFinder } from './contracts';

const BUILT_IN_NAME = 'FollowThrough';
const BUILT_IN_INSTRUCTIONS = `Use FollowThrough as an action-oriented workbench.

Discover the available action tools before answering. Prefer read tools to inspect current state, proposal tools for AI-generated suggestions, and mutation tools only when the requested execution mode permits them. Load other skills lazily when their summaries or trigger hints match the request. Keep AI-generated proposals reviewable and preserve provenance.`;
const now = (): DateTime => new Date().toISOString() as DateTime;

export class DefaultBuiltInSkillProvisioner implements BuiltInSkillProvisioner {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly notes: NoteRepository,
		private readonly skills: SkillRepository
	) {}

	async ensure(actor: ActorContext): Promise<void> {
		const projects = await this.projects.listActive(actor);
		const project =
			projects.find((candidate) => candidate.name === DEFAULT_PROJECT_NAME) ??
			(await this.projects.insert(actor, { name: DEFAULT_PROJECT_NAME }));
		const notes = await this.notes.listActive(actor, project.id);
		const existing = notes.find(
			(note) =>
				note.builtInKey === 'followthrough' ||
				(note.kind === 'skill' && note.title.toLocaleLowerCase() === 'followthrough')
		);
		if (existing) return;
		const timestamp = now();
		const note = await this.notes.insert(actor, {
			id: crypto.randomUUID() as NoteId,
			userId: actor.userId,
			projectId: project.id as ProjectId,
			kind: 'skill',
			position: await this.notes.countSiblings(actor, project.id),
			title: BUILT_IN_NAME,
			builtInKey: 'followthrough',
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: BUILT_IN_INSTRUCTIONS }] }]
			},
			plainText: BUILT_IN_INSTRUCTIONS,
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
		await this.skills.insert(actor, {
			note,
			name: BUILT_IN_NAME,
			description: 'Discover and use FollowThrough actions safely.',
			triggerHints: ['create', 'update', 'organize', 'plan', 'follow through'],
			isEnabled: true
		});
	}
}

export class ProvisioningSkillFinder implements SkillFinder {
	constructor(
		private readonly provisioner: BuiltInSkillProvisioner,
		private readonly delegate: SkillFinder
	) {}

	async listEnabled(actor: ActorContext): Promise<readonly SkillSummary[]> {
		await this.provisioner.ensure(actor);
		return this.delegate.listEnabled(actor);
	}

	load(actor: ActorContext, noteId: NoteId): Promise<Skill> {
		return this.delegate.load(actor, noteId);
	}
}
