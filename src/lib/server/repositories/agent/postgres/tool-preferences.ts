import { NotFoundError } from '$lib/errors';
import { projects } from '$lib/server/db/schema/notes';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type {
	StoredToolPreference,
	ToolPreferenceRepository
} from '$lib/server/repositories/agent';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/agent';

const toPreference = (row: { toolName: string; enabled: boolean }): StoredToolPreference => ({
	toolName: row.toolName,
	enabled: row.enabled
});

export class ToolPreferenceRecords implements ToolPreferenceRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async listForUser(): Promise<readonly StoredToolPreference[]> {
		const rows = await this.database
			.select({
				toolName: schema.toolPreferences.toolName,
				enabled: schema.toolPreferences.enabled
			})
			.from(schema.toolPreferences)
			.where(eq(schema.toolPreferences.userId, this.actor.userId));
		return rows.map(toPreference);
	}

	async listForProject(projectId: ProjectId): Promise<readonly StoredToolPreference[]> {
		const rows = await this.database
			.select({
				toolName: schema.projectToolOverrides.toolName,
				enabled: schema.projectToolOverrides.enabled
			})
			.from(schema.projectToolOverrides)
			.where(
				and(
					eq(schema.projectToolOverrides.userId, this.actor.userId),
					eq(schema.projectToolOverrides.projectId, projectId)
				)
			);
		return rows.map(toPreference);
	}

	async upsertForUser(preference: StoredToolPreference): Promise<void> {
		await this.database
			.insert(schema.toolPreferences)
			.values({
				userId: this.actor.userId,
				toolName: preference.toolName,
				enabled: preference.enabled
			})
			.onConflictDoUpdate({
				target: [schema.toolPreferences.userId, schema.toolPreferences.toolName],
				set: { enabled: preference.enabled, updatedAt: new Date() }
			});
	}

	async upsertForProject(projectId: ProjectId, preference: StoredToolPreference): Promise<void> {
		const [project] = await this.database
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), eq(projects.userId, this.actor.userId)));
		if (!project) throw new NotFoundError('Project was not found');
		await this.database
			.insert(schema.projectToolOverrides)
			.values({
				userId: this.actor.userId,
				projectId,
				toolName: preference.toolName,
				enabled: preference.enabled
			})
			.onConflictDoUpdate({
				target: [
					schema.projectToolOverrides.userId,
					schema.projectToolOverrides.projectId,
					schema.projectToolOverrides.toolName
				],
				set: { enabled: preference.enabled, updatedAt: new Date() }
			});
	}

	async deleteProjectOverride(projectId: ProjectId, toolName: string): Promise<void> {
		await this.database
			.delete(schema.projectToolOverrides)
			.where(
				and(
					eq(schema.projectToolOverrides.userId, this.actor.userId),
					eq(schema.projectToolOverrides.projectId, projectId),
					eq(schema.projectToolOverrides.toolName, toolName)
				)
			);
	}
}
