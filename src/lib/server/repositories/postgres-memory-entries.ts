import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ActorContext, MemoryEntry, MemoryEntryId } from '$lib/models';
import { NotFoundError } from '$lib/models';
import type { MemoryEntryListFilter, MemoryEntryRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toMemoryEntry } from '../domain/mappers';

export class PostgresMemoryEntryRepository implements MemoryEntryRepository {
	constructor(private readonly database: Database) {}

	async findById(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.memoryEntries)
			.where(and(eq(schema.memoryEntries.id, id), eq(schema.memoryEntries.userId, actor.userId)));
		return row ? toMemoryEntry(row) : undefined;
	}

	async list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]> {
		const conditions = [
			eq(schema.memoryEntries.userId, actor.userId),
			filter.projectId
				? eq(schema.memoryEntries.projectId, filter.projectId)
				: isNull(schema.memoryEntries.projectId)
		];
		if (!filter.includeDeleted) conditions.push(isNull(schema.memoryEntries.deletedAt));
		return (
			await this.database
				.select()
				.from(schema.memoryEntries)
				.where(and(...conditions))
				.orderBy(desc(schema.memoryEntries.updatedAt))
		).map(toMemoryEntry);
	}

	async insert(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		const [row] = await this.database
			.insert(schema.memoryEntries)
			.values({
				id: entry.id,
				userId: actor.userId,
				projectId: entry.projectId,
				content: entry.content,
				type: entry.type,
				shareWithAgents: entry.shareWithAgents,
				provenanceId: entry.provenanceId,
				replacesEntryId: entry.replacesEntryId,
				deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : undefined,
				createdAt: new Date(entry.createdAt),
				updatedAt: new Date(entry.updatedAt)
			})
			.returning();
		return toMemoryEntry(row!);
	}

	async update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		const [row] = await this.database
			.update(schema.memoryEntries)
			.set({
				content: entry.content,
				type: entry.type ?? null,
				shareWithAgents: entry.shareWithAgents,
				provenanceId: entry.provenanceId,
				replacesEntryId: entry.replacesEntryId,
				deletedAt: entry.deletedAt ? new Date(entry.deletedAt) : null,
				updatedAt: new Date(entry.updatedAt)
			})
			.where(
				and(eq(schema.memoryEntries.id, entry.id), eq(schema.memoryEntries.userId, actor.userId))
			)
			.returning();
		if (!row) throw new NotFoundError('Memory entry was not found');
		return toMemoryEntry(row);
	}
}
