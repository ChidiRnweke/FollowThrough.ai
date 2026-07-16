import { and, asc, eq } from 'drizzle-orm';
import type { ActorContext, Artifact, ArtifactId, ArtifactView, NoteId, ProjectId, TemplateId } from '$lib/models';
import type { ArtifactRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const instant = (value: Date): Artifact['createdAt'] => value.toISOString() as Artifact['createdAt'];

const toArtifact = (row: typeof schema.artifacts.$inferSelect): Artifact => ({
	id: row.id as ArtifactId,
	userId: row.userId as Artifact['userId'],
	projectId: row.projectId as ProjectId,
	title: row.title,
	format: row.format as Artifact['format'],
	objectKey: row.objectKey,
	byteSize: row.byteSize,
	sourceNoteIds: (row.sourceNoteIds as NoteId[]) ?? [],
	templateId: row.templateId ? (row.templateId as TemplateId) : undefined,
	provenanceId: row.provenanceId ? (row.provenanceId as Artifact['provenanceId']) : undefined,
	runId: row.runId ?? undefined,
	createdAt: instant(row.createdAt)
});

export class PostgresArtifactRepository implements ArtifactRepository {
	constructor(private readonly database: Database) {}

	async insert(actor: ActorContext, artifact: Artifact): Promise<Artifact> {
		const [row] = await this.database
			.insert(schema.artifacts)
			.values({
				id: artifact.id,
				userId: actor.userId,
				projectId: artifact.projectId,
				title: artifact.title,
				format: artifact.format,
				objectKey: artifact.objectKey,
				byteSize: artifact.byteSize,
				sourceNoteIds: artifact.sourceNoteIds,
				templateId: artifact.templateId,
				provenanceId: artifact.provenanceId,
				runId: artifact.runId,
				createdAt: new Date(artifact.createdAt)
			})
			.returning();
		return toArtifact(row!);
	}

	async listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ArtifactView[]> {
		const rows = await this.database
			.select({
				artifact: schema.artifacts,
				projectName: schema.projects.name,
				templateName: schema.projectTemplates.name
			})
			.from(schema.artifacts)
			.innerJoin(schema.projects, eq(schema.projects.id, schema.artifacts.projectId))
			.leftJoin(schema.projectTemplates, eq(schema.projectTemplates.id, schema.artifacts.templateId))
			.where(
				and(
					eq(schema.artifacts.projectId, projectId),
					eq(schema.artifacts.userId, actor.userId)
				)
			)
			.orderBy(asc(schema.artifacts.createdAt));
		return rows.map(({ artifact, projectName, templateName }) => ({
			...toArtifact(artifact),
			projectName,
			templateName: templateName ?? undefined
		}));
	}

	async findById(actor: ActorContext, id: ArtifactId): Promise<Artifact | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.artifacts)
			.where(and(eq(schema.artifacts.id, id), eq(schema.artifacts.userId, actor.userId)));
		return row ? toArtifact(row) : undefined;
	}

	async delete(actor: ActorContext, id: ArtifactId): Promise<void> {
		await this.database
			.delete(schema.artifacts)
			.where(and(eq(schema.artifacts.id, id), eq(schema.artifacts.userId, actor.userId)));
	}
}
