import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { DiagramId } from '$lib/models/diagrams';
import { diagramEtag } from '$lib/models/diagrams';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedNote } from '../database-harness';

it.each([
	{ operation: 'archive', suffix: '16801', message: 'already in the trash' },
	{ operation: 'save', suffix: '18403', message: 'Archived diagrams cannot be edited' }
])(
	'refuses $operation after a concurrent archive commits',
	async ({ operation, suffix, message }) => {
		const { owner, project } = await seedNote(suffix);
		const records = new DiagramRecords(context.db);
		const diagram = await records.insert(
			owner,
			drawioBuilder({
				id: crypto.randomUUID() as DiagramId,
				userId: owner.userId,
				projectId: project.id,
				sourceNoteId: undefined
			})
		);
		const writer = connectPostgresTestDatabase(context.url);
		if (diagram.kind !== 'drawio') throw new Error('Expected a draw.io diagram');
		const blocker = postgres(context.url, { max: 2 });
		const { database, transactionRunner } = createTransactionContext(writer.db);
		const projects = new ProjectRecords(database);
		const notes = createNotesCapability({ db: database, projects });
		const library = new DiagramLibrary(
			new DiagramRecords(database),
			notes.repository,
			notes.anchors,
			notes.provenanceRepository,
			projects
		);
		const controller = new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				diagramTrash: library,
				diagramDraftWriter: library,
				drawioXmlValidator: { validate: (source) => source },
				drawioTextExtractor: { extract: async () => diagram.searchableText },
				diagramIndexer: new InMemoryDiagrams(),
				transactionRunner,
				now: () => now
			})
		);
		const locked = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const archiving = blocker.begin(async (transaction) => {
			await transaction`update diagrams set archived_at = now() where id = ${diagram.id}`;
			locked.resolve();
			await release.promise;
		});
		try {
			await locked.promise;
			const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
			const action =
				operation === 'archive'
					? controller.archiveProjectDiagram(owner, { diagramId: diagram.id })
					: controller.saveProjectDiagramDraft(owner, {
							diagramId: diagram.id,
							source: diagram.source,
							baseEtag: diagramEtag(diagram)
						});
			const rejected = expect(action).rejects.toThrow(message);
			await vi.waitFor(async () => {
				const waiting = await blocker<
					{ pid: number }[]
				>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
				if (waiting.length !== 1) throw new Error('Archive has not reached the locked diagram');
			});
			release.resolve();
			await archiving;
			await rejected;
		} finally {
			release.resolve();
			await archiving;
			await Promise.all([writer.close(), blocker.end()]);
		}
	}
);

it('does not expose another actor’s diagram through a locking read', async () => {
	const { owner, project } = await seedNote('16802');
	const diagram = await new DiagramRecords(context.db).insert(
		owner,
		drawioBuilder({
			id: crypto.randomUUID() as DiagramId,
			userId: owner.userId,
			projectId: project.id,
			sourceNoteId: undefined
		})
	);
	const { database, transactionRunner } = createTransactionContext(context.db);
	expect(
		await transactionRunner.run(() =>
			new DiagramRecords(database).findForWrite(actor('16803'), diagram.id)
		)
	).toBeUndefined();
});
