import { and, asc, eq, isNull } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { CreateProjectInput, Project, ProjectId, ProjectRename } from '$lib/models/projects';
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
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async insert(input: CreateProjectInput): Promise<Project> {
		try {
			const [row] = await this.database
				.insert(schema.projects)
				.values({
					...(input.id !== undefined ? { id: input.id } : {}),
					userId: this.actor.userId,
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
				throw new ConflictError('This workspace already has an active inbox');
			throw error;
		}
	}

	async findForWrite(projectId: ProjectId): Promise<Project | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projects)
			.where(
				and(
					eq(schema.projects.id, projectId),
					eq(schema.projects.userId, this.actor.userId),
					isNull(schema.projects.archivedAt)
				)
			)
			// Serialize project writers without blocking foreign-key checks from note indexing.
			.for('no key update');
		return row ? toProject(row) : undefined;
	}

	async findById(projectId: ProjectId): Promise<Project | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projects)
			.where(
				and(
					eq(schema.projects.id, projectId),
					eq(schema.projects.userId, this.actor.userId),
					isNull(schema.projects.archivedAt)
				)
			);
		return row ? toProject(row) : undefined;
	}

	async listActive(): Promise<readonly Project[]> {
		return (
			await this.database
				.select()
				.from(schema.projects)
				.where(
					and(eq(schema.projects.userId, this.actor.userId), isNull(schema.projects.archivedAt))
				)
				.orderBy(asc(schema.projects.name))
		).map(toProject);
	}

	async update(input: ProjectRename): Promise<Project> {
		try {
			const [row] = await this.database
				.update(schema.projects)
				.set({ name: input.name, description: input.description })
				.where(
					and(
						eq(schema.projects.id, input.projectId),
						eq(schema.projects.userId, this.actor.userId),
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

	async archive(projectId: ProjectId): Promise<Project> {
		const [row] = await this.database
			.update(schema.projects)
			.set({ archivedAt: new Date() })
			.where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, this.actor.userId)))
			.returning();
		return toProject(row!);
	}

	async setSectionNumberingDefault(
		projectId: ProjectId,
		enabled: boolean | null
	): Promise<Project> {
		const [row] = await this.database
			.update(schema.projects)
			.set({ sectionNumberingDefault: enabled })
			.where(
				and(
					eq(schema.projects.id, projectId),
					eq(schema.projects.userId, this.actor.userId),
					isNull(schema.projects.archivedAt)
				)
			)
			.returning();
		if (!row) throw new NotFoundError('Project was not found');
		return toProject(row);
	}

	async list(projectId: ProjectId): Promise<readonly Note[]> {
		return (
			await this.database
				.select()
				.from(schema.notes)
				.where(
					and(
						eq(schema.notes.userId, this.actor.userId),
						eq(schema.notes.projectId, projectId),
						isNull(schema.notes.archivedAt)
					)
				)
				.orderBy(asc(schema.notes.position), asc(schema.notes.createdAt))
		).map(toNote);
	}

	async persistOrder(
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void> {
		for (const entry of entries)
			await this.database
				.update(schema.notes)
				.set({ parentId: entry.parentId ?? null, position: entry.position })
				.where(and(eq(schema.notes.id, entry.id), eq(schema.notes.userId, this.actor.userId)));
	}
}
