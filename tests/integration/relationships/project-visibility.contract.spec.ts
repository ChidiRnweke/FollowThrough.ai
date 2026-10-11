import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { createRelationshipServices } from '$lib/server/factories/capabilities/relationships-capability-factory';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedUser } from '../database-harness';

it('hides a retained backlink after built-in recovery moves its source out of an archived project', async () => {
	const owner = await seedUser('29001');
	const tx = createTransactionContext(context.db);
	const projects = new ProjectRecords(owner, tx.database);
	const notes = new NoteRecords(owner, tx.database);
	const provenance = new ProvenanceRecords(owner, tx.database);
	const { builtIns } = createSkillsCapability(owner, {
		now: testClock,
		db: tx.database,
		projects,
		notes,
		provenance
	});
	await tx.transactionRunner.run(() => builtIns.ensure());
	const source = (await notes.findByBuiltInKey('followthrough'))!;
	const target = await notes.insert(
		noteBuilder({
			id: '40000000-0000-4000-8000-000000029001' as NoteId,
			userId: owner.userId,
			projectId: source.projectId,
			title: 'Original project note'
		})
	);
	const relationships = new RelationshipRecords(owner, tx.database);
	const graph = createRelationshipServices(
		owner,
		relationships,
		notes,
		new SourceAnchorRecords(owner, tx.database),
		provenance,
		testClock
	);
	const edge = await tx.transactionRunner.run(() =>
		graph.creator
			.createWithChange({
				sourceNoteId: source.id,
				targetNoteId: target.id,
				kind: 'mentions'
			})
			.then((change) => change.after)
	);
	await projects.archive(source.projectId);
	await tx.transactionRunner.run(() => builtIns.ensure());
	const recovered = await notes.findById(source.id);
	expect({
		recoveredElsewhere: recovered !== undefined && recovered.projectId !== source.projectId,
		contexts: await graph.reader.readContexts(await graph.reader.findForNote(source.id)),
		retained: (await relationships.listForNote(source.id)).map((item) => item.id)
	}).toEqual({ recoveredElsewhere: true, contexts: [], retained: [edge.id] });
});
