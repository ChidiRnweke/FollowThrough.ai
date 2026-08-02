import { describe, expect, it } from 'vitest';
import type { DiagramId } from '$lib/models/diagrams';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { context, now, seedNote } from '../database-harness';
describe('Postgres diagram repository invariants', () => {
	it('limits project listing to the requested project', async () => {
		const { owner, project, note } = await seedNote('32');
		const repository = new DiagramRecords(context.db);
		await repository.insert(owner, {
			id: 'a0000000-0000-4000-8000-000000000032' as DiagramId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'mermaid',
			source: 'flowchart LR\nA --> B',
			searchableText: 'A B',
			createdAt: now,
			updatedAt: now
		});
		expect((await repository.listForProject(owner, project.id)).map((item) => item.noteId)).toEqual(
			[note.id]
		);
	});
});
