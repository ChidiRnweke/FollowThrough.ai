import { and, eq } from 'drizzle-orm';
import type { ActorContext, ProjectId } from '$lib/models';
import type { StoredToolPreference, ToolPreferenceRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toPreference = (row: { toolName: string; enabled: boolean }): StoredToolPreference => ({
	toolName: row.toolName,
	enabled: row.enabled
});

export class PostgresToolPreferenceRepository implements ToolPreferenceRepository {
	constructor(private readonly database: Database) {}

	async listForUser(actor: ActorContext): Promise<readonly StoredToolPreference[]> {
		const rows = await this.database
			.select({
				toolName: schema.toolPreferences.toolName,
				enabled: schema.toolPreferences.enabled
			})
			.from(schema.toolPreferences)
			.where(eq(schema.toolPreferences.userId, actor.userId));
		return rows.map(toPreference);
	}

	async listForProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly StoredToolPreference[]> {
		const rows = await this.database
			.select({
				toolName: schema.projectToolOverrides.toolName,
				enabled: schema.projectToolOverrides.enabled
			})
			.from(schema.projectToolOverrides)
			.where(
				and(
					eq(schema.projectToolOverrides.userId, actor.userId),
					eq(schema.projectToolOverrides.projectId, projectId)
				)
			);
		return rows.map(toPreference);
	}

	async upsertForUser(actor: ActorContext, preference: StoredToolPreference): Promise<void> {
		await this.database
			.insert(schema.toolPreferences)
			.values({
				userId: actor.userId,
				toolName: preference.toolName,
				enabled: preference.enabled
			})
			.onConflictDoUpdate({
				target: [schema.toolPreferences.userId, schema.toolPreferences.toolName],
				set: { enabled: preference.enabled, updatedAt: new Date() }
			});
	}

	async upsertForProject(
		actor: ActorContext,
		projectId: ProjectId,
		preference: StoredToolPreference
	): Promise<void> {
		await this.database
			.insert(schema.projectToolOverrides)
			.values({
				userId: actor.userId,
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

	async deleteProjectOverride(
		actor: ActorContext,
		projectId: ProjectId,
		toolName: string
	): Promise<void> {
		await this.database
			.delete(schema.projectToolOverrides)
			.where(
				and(
					eq(schema.projectToolOverrides.userId, actor.userId),
					eq(schema.projectToolOverrides.projectId, projectId),
					eq(schema.projectToolOverrides.toolName, toolName)
				)
			);
	}
}
