import { and, asc, eq } from 'drizzle-orm';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId, ProjectTemplate } from '$lib/models/projects';
import type { TemplateId } from '$lib/models/deliverables';
import type { TemplateRepository } from '$lib/server/repositories/deliverables';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/deliverables';

const instant = (value: Date): ProjectTemplate['createdAt'] =>
	value.toISOString() as ProjectTemplate['createdAt'];

const toTemplate = (row: typeof schema.projectTemplates.$inferSelect): ProjectTemplate => ({
	id: row.id as TemplateId,
	userId: row.userId as ProjectTemplate['userId'],
	projectId: row.projectId as ProjectId,
	name: row.name,
	objectKey: row.objectKey,
	mediaType: row.mediaType,
	byteSize: row.byteSize,
	extractedStyles: row.extractedStyles ?? {},
	isDefault: row.isDefault,
	createdAt: instant(row.createdAt),
	updatedAt: instant(row.updatedAt)
});

export class TemplateRecords implements TemplateRepository {
	constructor(private readonly database: Database) {}

	async insert(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate> {
		const [row] = await this.database
			.insert(schema.projectTemplates)
			.values({
				id: template.id,
				userId: actor.userId,
				projectId: template.projectId,
				name: template.name,
				objectKey: template.objectKey,
				mediaType: template.mediaType,
				byteSize: template.byteSize,
				extractedStyles: template.extractedStyles ?? {},
				isDefault: template.isDefault,
				createdAt: new Date(template.createdAt),
				updatedAt: new Date(template.updatedAt)
			})
			.returning();
		return toTemplate(row!);
	}

	async findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.projectTemplates)
			.where(
				and(eq(schema.projectTemplates.id, id), eq(schema.projectTemplates.userId, actor.userId))
			);
		return row ? toTemplate(row) : undefined;
	}

	async listByProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly ProjectTemplate[]> {
		return (
			await this.database
				.select()
				.from(schema.projectTemplates)
				.where(
					and(
						eq(schema.projectTemplates.projectId, projectId),
						eq(schema.projectTemplates.userId, actor.userId)
					)
				)
				.orderBy(asc(schema.projectTemplates.name))
		).map(toTemplate);
	}

	async update(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate> {
		const [row] = await this.database
			.update(schema.projectTemplates)
			.set({
				name: template.name,
				objectKey: template.objectKey,
				mediaType: template.mediaType,
				byteSize: template.byteSize,
				extractedStyles: template.extractedStyles ?? {},
				isDefault: template.isDefault,
				updatedAt: new Date()
			})
			.where(
				and(
					eq(schema.projectTemplates.id, template.id),
					eq(schema.projectTemplates.userId, actor.userId)
				)
			)
			.returning();
		return toTemplate(row!);
	}

	async delete(actor: ActorContext, id: TemplateId): Promise<void> {
		await this.database
			.delete(schema.projectTemplates)
			.where(
				and(eq(schema.projectTemplates.id, id), eq(schema.projectTemplates.userId, actor.userId))
			);
	}
}
