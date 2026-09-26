import { expect, it } from 'vitest';
import type { SearchDocumentId } from '$lib/models/knowledge-search';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { MemoryRecords } from '$lib/server/repositories/memory/postgres/memory-entries';
import {
	memoryEntryBuilder,
	testMemoryEntryId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedNote } from '../database-harness';

const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
const setup = async (suffix: string) => {
	const archived = await seedNote(suffix);
	const active = await seedNote(String(Number(suffix) + 100), archived.owner);
	const repository = new KnowledgeIndexRecords(context.db);
	const memory = await new MemoryRecords(context.db).insert(
		archived.owner,
		memoryEntryBuilder({
			id: testMemoryEntryId(Number(suffix)),
			userId: archived.owner.userId,
			projectId: archived.project.id,
			content: 'Archived memory visibility'
		})
	);
	for (const item of [archived, active])
		await repository.replaceForNote(item.owner, item.note.id, [
			{
				id: crypto.randomUUID() as SearchDocumentId,
				projectId: item.project.id,
				noteId: item.note.id,
				content: 'Project visibility note',
				contentHash: 'note-visibility',
				sourceRevision: 1,
				chunkIndex: 0,
				embedding: vector,
				embeddingModel: 'contract-model'
			}
		]);
	await repository.replaceForMemoryEntry(archived.owner, memory.id, [
		{
			id: crypto.randomUUID() as SearchDocumentId,
			projectId: archived.project.id,
			memoryEntryId: memory.id,
			content: memory.content,
			contentHash: 'memory-visibility',
			sourceRevision: 1,
			chunkIndex: 0,
			embedding: vector,
			embeddingModel: 'contract-model'
		}
	]);
	await new ProjectRecords(context.db).archive(archived.owner, archived.project.id);
	return { archived, active, repository, memory };
};
it.each(['text', 'vector'] as const)(
	'excludes archived project chunks from unscoped %s search',
	async (mode) => {
		const { archived, active, repository } = await setup(mode === 'text' ? '22501' : '22502');
		const matches =
			mode === 'text'
				? await repository.search(archived.owner, 'visibility', 10)
				: await repository.searchByEmbedding(archived.owner, vector, 10);
		expect(matches.map((match) => match.document.projectId)).toEqual([active.project.id]);
	}
);
it.each(['text', 'vector'] as const)(
	'excludes archived project chunks from explicitly scoped %s search',
	async (mode) => {
		const { archived, repository } = await setup(mode === 'text' ? '22503' : '22504');
		const matches =
			mode === 'text'
				? await repository.search(archived.owner, 'visibility', 10, archived.project.id)
				: await repository.searchByEmbedding(archived.owner, vector, 10, archived.project.id);
		expect(matches).toEqual([]);
	}
);
it('retains archived memory chunks for storage maintenance', async () => {
	const { archived, repository, memory } = await setup('22505');
	expect(
		(await repository.listForMemoryEntry(archived.owner, memory.id)).map((chunk) => chunk.content)
	).toEqual([memory.content]);
});
