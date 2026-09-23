import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { RelationshipGraph } from '$lib/server/services/relationships/graph';
import { context, seedNote } from '../database-harness';

const graphFor = (connection: ReturnType<typeof connectPostgresTestDatabase>) => {
	const { database, transactionRunner } = createTransactionContext(connection.db);
	const records = new RelationshipRecords(database);
	return {
		transactionRunner,
		records,
		graph: new RelationshipGraph(
			records,
			new NoteRecords(database),
			new SourceAnchorRecords(database),
			new ProvenanceRecords(database)
		)
	};
};

const setup = async (suffix: string) => {
	const { owner, note } = await seedNote(suffix);
	const target = await new NoteRecords(context.db).insert(owner, {
		...note,
		id: crypto.randomUUID() as NoteId,
		position: 1
	});
	return {
		owner,
		input: { sourceNoteId: note.id, targetNoteId: target.id, kind: 'elaborates' as const }
	};
};

describe('Stored relationship decisions', () => {
	it('keeps one semantic edge when concurrent requests create it', async () => {
		const { owner, input } = await setup('16001');
		const first = connectPostgresTestDatabase(context.url);
		const second = connectPostgresTestDatabase(context.url);
		try {
			const left = graphFor(first);
			const right = graphFor(second);
			const changes = await Promise.all([
				left.transactionRunner.run(() => left.graph.createWithChange(owner, input)),
				right.transactionRunner.run(() => right.graph.createWithChange(owner, input))
			]);
			expect({
				kinds: changes.map((change) => change.kind).sort(),
				stored: await left.records.listForNote(owner, input.sourceNoteId)
			}).toEqual({
				kinds: ['created', 'unchanged'],
				stored: [changes[0]!.after]
			});
		} finally {
			await Promise.all([first.close(), second.close()]);
		}
	});
	it('clears an explanation without replacing the original relationship identity', async () => {
		const { owner, input } = await setup('16002');
		const { graph, transactionRunner, records } = graphFor(context);
		const original = await transactionRunner.run(() =>
			graph.create(owner, { ...input, justification: 'Original' })
		);
		const change = await transactionRunner.run(() => graph.createWithChange(owner, input));
		expect({ kind: change.kind, stored: await records.findById(owner, original.id) }).toEqual({
			kind: 'modified',
			stored: { ...original, justification: undefined, updatedAt: change.after.updatedAt }
		});
	});
});
