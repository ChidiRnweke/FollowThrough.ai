import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import * as schema from '$lib/server/db/schema';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, seedNote } from '../database-harness';
describe('Postgres search repository invariants', () => {
	it('limits vector search to the requested project', async () => {
		const owner = actor('10');
		const projects = new ProjectRecords(context.db);
		const first = await projects.insert(owner, { name: 'Search one' });
		const second = await projects.insert(owner, { name: 'Search two' });
		const noteIds = [
			'40000000-0000-4000-8000-000000000001' as NoteId,
			'40000000-0000-4000-8000-000000000002' as NoteId
		];
		await context.db.insert(schema.notes).values([
			{ id: noteIds[0], userId: owner.userId, projectId: first.id, title: 'First' },
			{ id: noteIds[1], userId: owner.userId, projectId: second.id, title: 'Second' }
		]);
		const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
		const repository = new KnowledgeIndexRecords(context.db);
		for (const [index, project] of [first, second].entries()) {
			const document: SearchDocument = {
				id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` as SearchDocumentId,
				projectId: project.id,
				noteId: noteIds[index]!,
				content: `document ${index}`,
				contentHash: `hash-${index}`,
				sourceRevision: 1,
				chunkIndex: 0,
				embedding: vector,
				embeddingModel: 'contract-model'
			};
			await repository.replaceForNote(owner, noteIds[index]!, [document]);
		}
		const matches = await repository.searchByEmbedding(owner, vector, 10, first.id);
		expect(matches.map((match) => match.document.projectId)).toEqual([first.id]);
	});
	it('does not return another actor’s search documents', async () => {
		const { owner, project, note } = await seedNote('47');
		const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
		const repository = new KnowledgeIndexRecords(context.db);
		await repository.replaceForNote(owner, note.id, [
			{
				id: '50000000-0000-4000-8000-000000000047' as SearchDocumentId,
				projectId: project.id,
				noteId: note.id,
				content: 'private architecture',
				contentHash: 'private-hash',
				sourceRevision: 1,
				chunkIndex: 0,
				embedding: vector,
				embeddingModel: 'contract-model'
			}
		]);
		expect(await repository.searchByEmbedding(actor('48'), vector, 10, project.id)).toEqual([]);
	});
});
describe('Postgres deferred embedding invariants', () => {
	const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
	const chunk = (
		suffix: string,
		projectId: ProjectId,
		noteId: NoteId,
		content: string,
		embedded: boolean
	): SearchDocument => ({
		id: `51000000-0000-4000-8000-${suffix.padStart(12, '0')}` as SearchDocumentId,
		projectId,
		noteId,
		content,
		contentHash: `hash-${content}`,
		sourceRevision: 1,
		chunkIndex: 0,
		...(embedded ? { embedding: vector, embeddingModel: 'contract-model' } : {})
	});
	it('reports a staged chunk with no vector as pending', async () => {
		const { owner, project, note } = await seedNote('911');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [
			chunk('911', project.id, note.id, 'pending text', false)
		]);
		expect(await repository.listPending(owner, source)).toHaveLength(1);
	});
	it('keeps a pending chunk out of vector search', async () => {
		const { owner, project, note } = await seedNote('912');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [
			chunk('912', project.id, note.id, 'pending text', false)
		]);
		const matches = await repository.searchByEmbedding(owner, vector, 10, project.id);
		expect(matches).toEqual([]);
	});
	it('still answers vector search from the superseded chunk after a re-stage', async () => {
		const { owner, project, note } = await seedNote('913');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [chunk('913', project.id, note.id, 'original', true)]);
		await repository.stage(owner, source, [chunk('913b', project.id, note.id, 'rewritten', false)]);
		const matches = await repository.searchByEmbedding(owner, vector, 10, project.id);
		expect(matches.map((match) => match.document.content)).toEqual(['original']);
	});
	it('hides the superseded chunk from lexical search', async () => {
		const { owner, project, note } = await seedNote('914');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [chunk('914', project.id, note.id, 'original', true)]);
		await repository.stage(owner, source, [chunk('914b', project.id, note.id, 'rewritten', false)]);
		expect(await repository.search(owner, 'original', 10, project.id)).toEqual([]);
	});
	it('retires the superseded chunk once the replacement is embedded', async () => {
		const { owner, project, note } = await seedNote('915');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [chunk('915', project.id, note.id, 'original', true)]);
		const replacement = chunk('915b', project.id, note.id, 'rewritten', false);
		await repository.stage(owner, source, [replacement]);
		await repository.completePending(
			owner,
			source,
			[{ id: replacement.id, embedding: vector }],
			'contract-model'
		);
		const matches = await repository.searchByEmbedding(owner, vector, 10, project.id);
		expect(matches.map((match) => match.document.content)).toEqual(['rewritten']);
	});
	it('holds the superseded chunk when a further revision is still pending', async () => {
		const { owner, project, note } = await seedNote('916');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [chunk('916', project.id, note.id, 'original', true)]);
		const second = chunk('916b', project.id, note.id, 'second', false);
		await repository.stage(owner, source, [second]);
		// A third revision lands before the worker writes the second one's vector back.
		await repository.stage(owner, source, [chunk('916c', project.id, note.id, 'third', false)]);
		await repository.completePending(
			owner,
			source,
			[{ id: second.id, embedding: vector }],
			'contract-model'
		);
		expect(await repository.searchByEmbedding(owner, vector, 10, project.id)).not.toEqual([]);
	});
	// The sweep is deliberately cross-actor — one worker serves every user — so what
	// matters is that each source is reported against the owner whose data it is.
	// That pairing is what lets the worker rebuild a correctly scoped ActorContext.
	it('attributes a pending source to its owner', async () => {
		const { owner, project, note } = await seedNote('917');
		const repository = new KnowledgeIndexRecords(context.db);
		await repository.stage(owner, { kind: 'note', noteId: note.id }, [
			chunk('917', project.id, note.id, 'pending text', false)
		]);
		const pending = await repository.listPendingSources(500);
		expect(
			pending.find((entry) => entry.source.kind === 'note' && entry.source.noteId === note.id)
				?.userId
		).toBe(owner.userId);
	});
	it('scopes pending chunk reads to the owning actor', async () => {
		const { owner, project, note } = await seedNote('918');
		const repository = new KnowledgeIndexRecords(context.db);
		const source = { kind: 'note', noteId: note.id } as const;
		await repository.stage(owner, source, [
			chunk('918', project.id, note.id, 'pending text', false)
		]);
		expect(await repository.listPending(actor('919'), source)).toEqual([]);
	});
});
