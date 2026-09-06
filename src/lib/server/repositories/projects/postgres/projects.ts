import { and, asc, eq, isNull } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	Project,
	ProjectId,
	RenameProjectInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError, NotFoundError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/projects';
import { toNote, toProject } from '$lib/server/db/mappers';
import { isUniqueViolation } from '$lib/server/db/postgres-errors';

const PROJECT_NAME_CONSTRAINT = 'projects_user_name_unique';
const PROJECT_INBOX_CONSTRAINT = 'projects_user_inbox_unique';

export class ProjectRecords implements ProjectRepository, ProjectTreeRepository {
	constructor(private readonly database: Database) {}

	async insert(actor: ActorContext, input: CreateProjectInput): Promise<Project> {
		await this.ensureUser(actor);
		try {
			const [row] = await this.database
				.insert(schema.projects)
				.values({
					...(input.id !== undefined ? { id: input.id } : {}),
					userId: actor.userId,
					name: input.name,
					role: input.role ?? 'workspace',
					description: input.description
				})
				.returning();
			return toProject(row!);
		} catch (error) {
			if (isUniqueViolation(error, PROJECT_NAME_CONSTRAINT))
				throw new ConflictError('An active project with this name already exists');
			if (isUniqueViolation(error, PROJECT_INBOX_CONSTRAINT))
				throw new ConflictError('This workspace already has an inbox');
			throw error;
		}
	}

	/**
	 * The user's inbox, found by role.
	 *
	 * Not by name: the name is the user's to change, and matching on it is what
	 * let a renamed project stop being the inbox while a new one silently became
	 * it. Absent only before provisioning has run.
	 */
	async findInbox(actor: ActorContext): Promise<Project | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projects)
			.where(
				and(
					eq(schema.projects.userId, actor.userId),
					eq(schema.projects.role, 'inbox'),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toProject(row) : undefined;
	}

	async findById(actor: ActorContext, projectId: ProjectId): Promise<Project | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projects)
			.where(
				and(
					eq(schema.projects.id, projectId),
					eq(schema.projects.userId, actor.userId),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toProject(row) : undefined;
	}

	async findFirstActive(actor: ActorContext): Promise<Project | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projects)
			.where(and(eq(schema.projects.userId, actor.userId), isNull(schema.projects.archivedAt)))
			.orderBy(asc(schema.projects.createdAt))
			.limit(1);
		return row ? toProject(row) : undefined;
	}

	async listActive(actor: ActorContext): Promise<readonly Project[]> {
		return (
			await this.database
				.select()
				.from(schema.projects)
				.where(and(eq(schema.projects.userId, actor.userId), isNull(schema.projects.archivedAt)))
				.orderBy(asc(schema.projects.name))
		).map(toProject);
	}

	async update(actor: ActorContext, input: RenameProjectInput): Promise<Project> {
		try {
			const [row] = await this.database
				.update(schema.projects)
				.set({ name: input.name, description: input.description })
				.where(
					and(
						eq(schema.projects.id, input.projectId),
						eq(schema.projects.userId, actor.userId),
						isNull(schema.projects.archivedAt)
					)
				)
				.returning();
			return toProject(row!);
		} catch (error) {
			if (isUniqueViolation(error, PROJECT_NAME_CONSTRAINT))
				throw new ConflictError('An active project with this name already exists');
			throw error;
		}
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const [row] = await this.database
			.update(schema.projects)
			.set({ archivedAt: new Date() })
			.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, actor.userId)))
			.returning();
		return toProject(row!);
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		projectId: ProjectId,
		enabled: boolean | null
	): Promise<Project> {
		const [row] = await this.database
			.update(schema.projects)
			.set({ sectionNumberingDefault: enabled })
			.where(
				and(
					eq(schema.projects.id, projectId),
					eq(schema.projects.userId, actor.userId),
					isNull(schema.projects.archivedAt)
				)
			)
			.returning();
		if (!row) throw new NotFoundError('Project was not found');
		return toProject(row);
	}

	async list(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		return (
			await this.database
				.select()
				.from(schema.notes)
				.where(
					and(
						eq(schema.notes.userId, actor.userId),
						eq(schema.notes.projectId, projectId),
						isNull(schema.notes.archivedAt)
					)
				)
				.orderBy(asc(schema.notes.position), asc(schema.notes.createdAt))
		).map(toNote);
	}

	async insertFolder(
		actor: ActorContext,
		input: CreateFolderInput,
		position: number
	): Promise<Note> {
		const [row] = await this.database
			.insert(schema.notes)
			.values({
				...(input.id !== undefined ? { id: input.id } : {}),
				userId: actor.userId,
				projectId: input.projectId,
				parentId: input.parentId,
				kind: 'folder',
				position,
				title: input.name
			})
			.returning();
		return toNote(row!);
	}

	async persistOrder(
		actor: ActorContext,
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void> {
		for (const entry of entries)
			await this.database
				.update(schema.notes)
				.set({ parentId: entry.parentId, position: entry.position })
				.where(and(eq(schema.notes.id, entry.id), eq(schema.notes.userId, actor.userId)));
	}

	private async ensureUser(actor: ActorContext): Promise<void> {
		await this.database
			.insert(schema.users)
			.values({
				id: actor.userId,
				email: `${actor.userId}@local.invalid`,
				displayName: 'Architect'
			})
			.onConflictDoNothing();
	}
}
