import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { LocalDate } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
import type { Lab } from './application';

export interface SeedNote {
	readonly title: string;
	/** Plain text body; indexed for `search` exactly as a saved note would be. */
	readonly body: string;
	/**
	 * Backdates the note's `created_at` (and its search chunks' `source_created_at`)
	 * after seeding, so cases can split artifacts by age. Note creation still goes
	 * through the real controllers — only the timestamp is adjusted afterwards.
	 */
	readonly createdAt?: string;
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
	readonly dueDate?: string;
	/** Backdates the todo's `created_at` after seeding. */
	readonly createdAt?: string;
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
	// Materializes the user row via UserDirectory.ensureLocal.
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
			if (seedNote.createdAt) {
				backdateCreatedAt(lab, actor, note.id, seedNote.createdAt, 'note');
			}
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
		// Save the skill body through the note path — the same write edit_skill and
		// save_skill use at runtime — so load_skill returns it as Markdown. The
		// `raw` manifest path is not used because the fixture body is a plain
		// instruction body, not a full SKILL.md with YAML frontmatter.
		await lab.controllers.notes().save(actor, {
			note: { ...skill.note, ...noteContentFromMarkdown(seedSkill.body) }
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
			responsibility: 'mine',
			...(seedTodo.dueDate ? { dueDate: seedTodo.dueDate as LocalDate } : {})
		});
		todoIds.set(seedTodo.title, todo.id);
		// Composite key for disambiguation when multiple projects share a todo title.
		if (seedTodo.projectName) {
			todoIds.set(`${seedTodo.title}|${seedTodo.projectName}`, todo.id);
		}
		if (seedTodo.createdAt) backdateCreatedAt(lab, actor, todo.id, seedTodo.createdAt, 'todo');
	}

	return { actor, projectIds, noteIds, skillIds, todoIds };
}

/**
 * Rewrites a seeded row's creation time so fixtures can model artifacts of
 * different ages. The `search_chunks` copy is rewritten too — the lexical and
 * semantic filters read `source_created_at`, which the indexer snapshots at
 * save time, so a case that only backdated the note row would pass `list` while
 * `search` silently ignored the range.
 */
export async function backdateCreatedAt(
	lab: Lab,
	actor: ActorContext,
	id: string,
	createdAt: string,
	kind: 'note' | 'todo'
): Promise<void> {
	const at = new Date(createdAt);
	if (kind === 'note') {
		await lab.db.execute(
			sql`UPDATE notes SET created_at = ${at}, updated_at = ${at} WHERE id = ${id} AND user_id = ${actor.userId}`
		);
		await lab.db.execute(
			sql`UPDATE search_chunks SET source_created_at = ${at} WHERE note_id = ${id} AND user_id = ${actor.userId}`
		);
		return;
	}
	await lab.db.execute(
		sql`UPDATE todos SET created_at = ${at}, updated_at = ${at} WHERE id = ${id} AND user_id = ${actor.userId}`
	);
}
