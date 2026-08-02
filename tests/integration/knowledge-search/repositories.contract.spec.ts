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
	// The supersede/hold/retire lifecycle is proven at the unit layer by
	// services/knowledge-search/index-maintenance.spec.ts against the in-memory
	// search repository. This file keeps the two SQL-fidelity facts no fake can
	// prove: the cross-actor sweep attribution and the per-actor pending read
	// scope. One end-to-end supersede round-trip through real SQL is covered by
	// the search-by-embedding tests above (replacement supersedes original).
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
