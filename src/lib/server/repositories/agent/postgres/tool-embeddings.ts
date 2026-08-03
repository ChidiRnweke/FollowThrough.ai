import { asc, cosineDistance, inArray, notInArray, sql } from 'drizzle-orm';
import type {
	StoredToolEmbedding,
	ToolEmbeddingRepository,
	ToolEmbeddingWrite
} from '$lib/server/repositories/agent/tool-embeddings';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/agent';

export class ToolEmbeddingRecords implements ToolEmbeddingRepository {
	constructor(private readonly database: Database) {}

	async list(): Promise<readonly StoredToolEmbedding[]> {
		return this.database
			.select({
				name: schema.toolEmbeddings.name,
				description: schema.toolEmbeddings.description,
				contentHash: schema.toolEmbeddings.contentHash,
				embeddingModel: schema.toolEmbeddings.embeddingModel
			})
			.from(schema.toolEmbeddings);
	}

	async upsert(rows: readonly ToolEmbeddingWrite[]): Promise<void> {
		if (rows.length === 0) return;
		await this.database
			.insert(schema.toolEmbeddings)
			.values(
				rows.map((row) => ({
					name: row.name,
					description: row.description,
					contentHash: row.contentHash,
					embedding: [...row.embedding],
					embeddingModel: row.embeddingModel
				}))
			)
			.onConflictDoUpdate({
				target: schema.toolEmbeddings.name,
				set: {
					description: sql`excluded.description`,
					contentHash: sql`excluded.content_hash`,
					embedding: sql`excluded.embedding`,
					embeddingModel: sql`excluded.embedding_model`,
					updatedAt: sql`now()`
				}
			});
	}

	async deleteExcept(names: readonly string[]): Promise<void> {
		if (names.length === 0) {
			await this.database.delete(schema.toolEmbeddings);
			return;
		}
		await this.database
			.delete(schema.toolEmbeddings)
			.where(notInArray(schema.toolEmbeddings.name, [...names]));
	}

	async rankByVector(
		queryVector: readonly number[],
		names: readonly string[],
		limit: number
	): Promise<string[]> {
		if (names.length === 0 || limit === 0) return [];
		const distance = cosineDistance(schema.toolEmbeddings.embedding, [...queryVector]);
		const rows = await this.database
			.select({ name: schema.toolEmbeddings.name })
			.from(schema.toolEmbeddings)
			.where(inArray(schema.toolEmbeddings.name, [...names]))
			.orderBy(asc(distance))
			.limit(limit);
		return rows.map((row) => row.name);
	}
}
