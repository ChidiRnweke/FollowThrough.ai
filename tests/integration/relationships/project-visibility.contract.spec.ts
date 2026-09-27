import { expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { RelationshipRecords } from '$lib/server/repositories/relationships/postgres/relationships';
import { RelationshipGraph } from '$lib/server/services/relationships/graph';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedUser } from '../database-harness';

it('hides a retained backlink after built-in recovery moves its source out of an archived project', async () => {
	const owner = await seedUser('29001');
	const tx = createTransactionContext(context.db);
	const projects = new ProjectRecords(tx.database);
	const notes = new NoteRecords(tx.database);
	const provenance = new ProvenanceRecords(tx.database);
	const { builtIns } = createSkillsCapability({ db: tx.database, projects, notes, provenance });
	await tx.transactionRunner.run(() => builtIns.ensure(owner));
	const source = (await notes.findByBuiltInKey(owner, 'followthrough'))!;
	const target = await notes.insert(
		owner,
		noteBuilder({
			id: '40000000-0000-4000-8000-000000029001' as NoteId,
			userId: owner.userId,
			projectId: source.projectId,
			title: 'Original project note'
		})
	);
	const relationships = new RelationshipRecords(tx.database);
	const graph = new RelationshipGraph(
		relationships,
		notes,
		new SourceAnchorRecords(tx.database),
		provenance
	);
	const edge = await tx.transactionRunner.run(() =>
		graph.create(owner, { sourceNoteId: source.id, targetNoteId: target.id, kind: 'mentions' })
	);
	await projects.archive(owner, source.projectId);
	await tx.transactionRunner.run(() => builtIns.ensure(owner));
	const recovered = await notes.findById(owner, source.id);
	expect({
		recoveredElsewhere: recovered !== undefined && recovered.projectId !== source.projectId,
		contexts: await graph.readContexts(owner, await graph.findForNote(owner, source.id)),
		retained: (await relationships.listForNote(owner, source.id)).map((item) => item.id)
	}).toEqual({ recoveredElsewhere: true, contexts: [], retained: [edge.id] });
});
