import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import type {
	ActorContext,
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams,
	NoteId,
	ProjectId,
	TemplateId
} from '$lib/models';
import type { ArtifactRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const instant = (value: Date): Artifact['createdAt'] =>
	value.toISOString() as Artifact['createdAt'];

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
	runId: row.runId ? (row.runId as Artifact['runId']) : undefined,
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

	async listByProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListArtifactsParams = {}
	): Promise<ListArtifactsOutput> {
		const query = params.query?.trim();
		const search = query
			? or(
					ilike(schema.artifacts.title, `%${query}%`),
					ilike(schema.artifacts.format, `%${query}%`),
					ilike(schema.projectTemplates.name, `%${query}%`)
				)
			: undefined;
		const filters = and(
			eq(schema.artifacts.projectId, projectId),
			eq(schema.artifacts.userId, actor.userId),
			search
		);
		const [{ total }] = await this.database
			.select({ total: count() })
			.from(schema.artifacts)
			.leftJoin(
				schema.projectTemplates,
				eq(schema.projectTemplates.id, schema.artifacts.templateId)
			)
			.where(filters);
		let statement = this.database
			.select({
				artifact: schema.artifacts,
				projectName: schema.projects.name,
				templateName: schema.projectTemplates.name,
				// A source note edited after generation makes the artifact stale.
				stale: sql<boolean>`coalesce((
					select max(n.updated_at) > ${schema.artifacts.createdAt}
					from ${schema.notes} n
					where n.id in (select value::uuid from jsonb_array_elements_text(${schema.artifacts.sourceNoteIds}))
				), false)`
			})
			.from(schema.artifacts)
			.innerJoin(schema.projects, eq(schema.projects.id, schema.artifacts.projectId))
			.leftJoin(
				schema.projectTemplates,
				eq(schema.projectTemplates.id, schema.artifacts.templateId)
			)
			.where(filters)
			.orderBy(asc(schema.artifacts.createdAt), asc(schema.artifacts.id))
			.$dynamic();
		if (params.limit !== undefined) statement = statement.limit(params.limit);
		if (params.offset !== undefined) statement = statement.offset(params.offset);
		const rows = await statement;
		return {
			artifacts: rows.map(({ artifact, projectName, templateName, stale }) => ({
				...toArtifact(artifact),
				projectName,
				templateName: templateName ?? undefined,
				stale
			})),
			total
		};
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
