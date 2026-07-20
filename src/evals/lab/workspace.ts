import { randomUUID } from 'node:crypto';
import type { ActorContext, NoteId, ProjectId, TodoId, UserId } from '$lib/models';
import type { Lab } from './application';

export interface SeedNote {
	readonly title: string;
	/** Plain text body; indexed for `search` exactly as a saved note would be. */
	readonly body: string;
}

export interface SeedSkill {
	readonly name: string;
	readonly description?: string;
	readonly triggerHints?: readonly string[];
	/** The full skill instruction body. */
	readonly body: string;
	/** Reference to a project name in the same fixture. */
	readonly projectName?: string;
}

export interface SeedTodo {
	readonly title: string;
	/** Reference to a project name in the same fixture. */
	readonly projectName?: string;
}

export interface SeedProject {
	readonly name: string;
	readonly notes?: readonly SeedNote[];
	/** Project-scoped memory, visible only when the agent knows the projectId. */
	readonly memories?: readonly string[];
}

export interface WorkspaceFixture {
	/** User-scoped memory — what `list_user_memory` returns. */
	readonly memories?: readonly string[];
	readonly projects?: readonly SeedProject[];
	readonly skills?: readonly SeedSkill[];
	readonly todos?: readonly SeedTodo[];
}

export interface SeededWorkspace {
	readonly actor: ActorContext;
	readonly projectIds: ReadonlyMap<string, ProjectId>;
	readonly noteIds: ReadonlyMap<string, NoteId>;
	readonly skillIds: ReadonlyMap<string, NoteId>;
	readonly todoIds: ReadonlyMap<string, TodoId>;
}

/**
 * Builds a workspace through the real controllers rather than by inserting
 * rows, so memories land in both the entry table and the pgvector index and
 * notes are chunked and embedded the way production would do it. A case that
 * seeded by raw insert could pass while `search` was broken.
 *
 * Each fixture gets a fresh user id. Every repository is actor-scoped, so cases
 * isolate from one another without truncating between runs.
 */
export async function seedWorkspace(lab: Lab, fixture: WorkspaceFixture): Promise<SeededWorkspace> {
	const actor: ActorContext = { userId: randomUUID() as UserId };
	// Materializes the user row via UserManagementService.ensureLocal.
	await lab.controllers.workspace().getShellContext(actor);

	const projectIds = new Map<string, ProjectId>();
	const noteIds = new Map<string, NoteId>();
	const skillIds = new Map<string, NoteId>();
	const todoIds = new Map<string, TodoId>();

	for (const content of fixture.memories ?? []) {
		await lab.controllers.memory().create(actor, { content, shareWithAgents: true });
	}

	for (const seedProject of fixture.projects ?? []) {
		const { project } = await lab.controllers.projects().create(actor, { name: seedProject.name });
		projectIds.set(seedProject.name, project.id);

		for (const content of seedProject.memories ?? []) {
			await lab.controllers
				.memory()
				.create(actor, { projectId: project.id, content, shareWithAgents: true });
		}

		for (const seedNote of seedProject.notes ?? []) {
			const { note } = await lab.controllers
				.notes()
				.create(actor, { projectId: project.id, title: seedNote.title });
			noteIds.set(seedNote.title, note.id);
			// Composite key for disambiguation when multiple projects share a note title.
			noteIds.set(`${seedNote.title}|${seedProject.name}`, note.id);
			// Saving is what indexes the body; creation only establishes the title.
			await lab.controllers.notes().save(actor, {
				note: {
					...note,
					plainText: seedNote.body,
					document: {
						type: 'doc',
						content: seedNote.body
							.split('\n\n')
							.filter((paragraph) => paragraph.trim().length > 0)
							.map((paragraph) => ({
								type: 'paragraph',
								content: [{ type: 'text', text: paragraph }]
							}))
					}
				}
			});
		}
	}

	for (const seedSkill of fixture.skills ?? []) {
		const projectId = seedSkill.projectName ? projectIds.get(seedSkill.projectName) : undefined;
		const { skill } = await lab.controllers.skills().create(actor, {
			name: seedSkill.name,
			...(seedSkill.description ? { description: seedSkill.description } : {}),
			...(seedSkill.triggerHints ? { triggerHints: seedSkill.triggerHints } : {}),
			...(projectId ? { projectId } : {})
		});
		skillIds.set(seedSkill.name, skill.note.id);
		// Save the skill body so load_skill returns it.
		await lab.controllers.skills().update(actor, {
			noteId: skill.note.id,
			raw: seedSkill.body
		});
	}

	for (const seedTodo of fixture.todos ?? []) {
		const projectId = seedTodo.projectName ? projectIds.get(seedTodo.projectName) : undefined;
		if (!projectId)
			throw new Error(
				`Todo "${seedTodo.title}" references unknown project "${seedTodo.projectName}"`
			);
		const { todo } = await lab.controllers.todos().create(actor, {
			title: seedTodo.title,
			projectId,
			responsibility: 'mine'
		});
		todoIds.set(seedTodo.title, todo.id);
		// Composite key for disambiguation when multiple projects share a todo title.
		if (seedTodo.projectName) {
			todoIds.set(`${seedTodo.title}|${seedTodo.projectName}`, todo.id);
		}
	}

	return { actor, projectIds, noteIds, skillIds, todoIds };
}
