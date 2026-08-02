import { describe, expect, it } from 'vitest';
import type { MemoryEntryId } from '$lib/models/memory';
import type { SearchDocumentId } from '$lib/models/knowledge-search';
import * as schema from '$lib/server/db/schema';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, now } from '../database-harness';
describe('Postgres memory-entry repository invariants', () => {
	const seedEntry = async (suffix: string) => {
		const owner = actor(suffix);
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: `Memory project ${suffix}`
		});
		const repository = new MemoryRecords(context.db);
		const entry = await repository.insert(owner, {
			id: `80000000-0000-4000-8000-${suffix.padStart(12, '0')}` as MemoryEntryId,
			userId: owner.userId,
			projectId: project.id,
			content: `Durable fact ${suffix}`,
			shareWithAgents: true,
			createdAt: now,
			updatedAt: now
		});
		return { owner, project, repository, entry };
	};
	it('round-trips an inserted entry', async () => {
		const { owner, repository, entry } = await seedEntry('60');
		expect(await repository.findById(owner, entry.id)).toEqual(entry);
	});
	// Profile/project separation (round-trip without a project, profile-only list,
	// project-only list) is proven at the unit layer by
	// services/memory/library.spec.ts; this file keeps the SQL facts only a real
	// database can prove (scoping, soft-delete, constraints, cascade).
	it('does not reveal an entry to another actor', async () => {
		const { repository, entry } = await seedEntry('61');
		expect(await repository.findById(actor('62'), entry.id)).toBeUndefined();
	});
	it('excludes soft-deleted entries from the default list', async () => {
		const { owner, project, repository, entry } = await seedEntry('63');
		await repository.update(owner, { ...entry, deletedAt: now });
		expect(await repository.list(owner, { projectId: project.id })).toEqual([]);
	});
	it('includes soft-deleted entries when requested', async () => {
		const { owner, project, repository, entry } = await seedEntry('64');
		await repository.update(owner, { ...entry, deletedAt: now });
		expect(
			(await repository.list(owner, { projectId: project.id, includeDeleted: true })).map(
				(item) => item.id
			)
		).toEqual([entry.id]);
	});
	it('clears the deletion marker on restore', async () => {
		const { owner, repository, entry } = await seedEntry('65');
		await repository.update(owner, { ...entry, deletedAt: now });
		await repository.update(owner, { ...entry, deletedAt: undefined });
		expect((await repository.findById(owner, entry.id))?.deletedAt).toBeUndefined();
	});
	it('stores memory-sourced search chunks without a note', async () => {
		const { owner, project, entry } = await seedEntry('66');
		const search = new KnowledgeIndexRecords(context.db);
		await search.replaceForMemoryEntry(owner, entry.id, [
			{
				id: '50000000-0000-4000-8000-000000000066' as SearchDocumentId,
				projectId: project.id,
				memoryEntryId: entry.id,
				content: entry.content,
				contentHash: 'memory-hash-66',
				sourceRevision: 1,
				chunkIndex: 0
			}
		]);
		expect((await search.listForMemoryEntry(owner, entry.id))[0]?.noteId).toBeUndefined();
	});
	it('rejects a search chunk without any source', async () => {
		const { owner, project } = await seedEntry('67');
		await expect(
			context.db.insert(schema.searchChunks).values({
				id: '50000000-0000-4000-8000-000000000067',
				userId: owner.userId,
				projectId: project.id,
				content: 'orphan chunk',
				contentHash: 'orphan-hash',
				sourceRevision: 1,
				chunkIndex: 0
			})
		).rejects.toThrow();
	});
	it('deletes memory chunks with their entry', async () => {
		const { owner, project, entry } = await seedEntry('68');
		const search = new KnowledgeIndexRecords(context.db);
		await search.replaceForMemoryEntry(owner, entry.id, [
			{
				id: '50000000-0000-4000-8000-000000000068' as SearchDocumentId,
				projectId: project.id,
				memoryEntryId: entry.id,
				content: entry.content,
				contentHash: 'memory-hash-68',
				sourceRevision: 1,
				chunkIndex: 0
			}
		]);
		await search.deleteForMemoryEntry(owner, entry.id);
		expect(await search.listForMemoryEntry(owner, entry.id)).toEqual([]);
	});
});
