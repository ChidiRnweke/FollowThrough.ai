import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import type { DiagramId } from '$lib/models/diagrams';
import { diagramEtag } from '$lib/models/diagrams';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createDiagramServices } from '$lib/server/factories/capabilities/diagrams-capability-factory';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createProjectsCapability } from '$lib/server/factories/capabilities/projects-capability-factory';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import {
	DrawioLabelReader,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { DiagramEditingService } from '$lib/services/diagrams/editing';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { DiagramLifecycleService } from '$lib/services/diagrams/trash';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { describe, expect, it } from 'vitest';
import { context, seedNote } from '../database-harness';

const source =
	'<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Offline edit" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
const setup = async (suffix: string, title: string | null = 'Architecture') => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability(seeded.owner, { db: database });
	const projects = createProjectsCapability(seeded.owner, { db: database });
	const notes = createNotesCapability(seeded.owner, {
		db: database,
		projects: projects.repository
	});
	const records = new DiagramRecords(seeded.owner, database);
	const library = createDiagramServices(
		seeded.owner,
		records,
		notes.repository,
		notes.anchors,
		notes.provenanceRepository,
		projects.repository
	);
	const diagram = drawioBuilder({
		title: title ?? undefined,
		id: crypto.randomUUID() as DiagramId,
		userId: seeded.owner.userId,
		projectId: seeded.project.id,
		sourceNoteId: seeded.note.id
	});
	await records.insert(diagram);
	const search = new KnowledgeIndexRecords(seeded.owner, database);
	const index = createContentIndex(
		search,
		new InMemoryRetrievalProvider().model,
		{ targetTokens: 2400, overlapTokens: 480 },
		true
	);
	await index.indexDiagram(diagram, { kind: 'note', title: seeded.note.title });
	const faults = { afterIndex: false };
	const controller = new DiagramStudio(
		seeded.owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DiagramStudioDependencies>({
			...agentToolResultsFixture(),
			diagramEditing: new DiagramEditingService(),
			diagramLifecycle: new DiagramLifecycleService(),
			syncMutations: sync.mutations,
			syncRetry: sync.mutationRetry,
			transactionRunner,
			diagramFinder: library.finder,
			diagramSourceNotes: notes.services.reader,
			diagramDraftWriter: library.draftWriter,
			diagramRevisionReader: library.revisionReader,
			diagramTrash: library.lifecycle,
			now: () => new Date().toISOString() as typeof diagram.updatedAt,
			diagramIndexer: {
				diagramContextRequirement: (diagram) => index.diagramContextRequirement(diagram),
				indexDiagram: async (value, sourceContext) => {
					const result = await index.indexDiagram(value, sourceContext);
					if (faults.afterIndex) throw new Error('Index transaction failed');
					return result;
				}
			},
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			diagramLabelPresentation: new DiagramLabelPresentationService(),
			drawioLabels: new DrawioLabelReader()
		})
	);
	const base = await sync.objects.read({ type: 'diagrams', id: [diagram.id] }, null);
	if (base.kind !== 'found') throw new Error('Expected the created diagram');
	return { ...seeded, controller, sync, diagram, search, faults, baseEtag: base.snapshot.etag };
};

describe('diagram edits through the shared mutation boundary', () => {
	it('clears the saved title when restoring an untitled publication', async () => {
		const { controller, diagram } = await setup('18401', null);
		const published = await controller.publishProjectDiagram({
			diagramId: diagram.id,
			source,
			renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
			baseEtag: diagramEtag(diagram.id, diagram.currentRevision)
		});
		if (published.outcome !== 'saved') throw new Error('Expected publication');
		const { revisions } = await controller.listDiagramRevisions({ diagramId: diagram.id });
		const revision = revisions[0];
		if (!revision) throw new Error('Expected a publication snapshot');
		const renamed = await controller.renameProjectDiagram({
			diagramId: diagram.id,
			title: 'Later title',
			baseEtag: published.etag
		});
		if (renamed.outcome !== 'saved') throw new Error('Expected rename');
		const restored = await controller.restoreDiagramRevision({
			diagramId: diagram.id,
			revisionId: revision.id,
			baseEtag: renamed.etag
		});
		if (restored.outcome !== 'saved') throw new Error('Expected restoration');
		const [row] = await context.client`select title from diagrams where id = ${diagram.id}`;
		expect({ returned: restored.diagram.title, stored: row?.title }).toEqual({
			returned: undefined,
			stored: null
		});
	});

	it('rolls back a rename and its search rows when indexing fails', async () => {
		const { controller, diagram, search, faults } = await setup('18402');
		const before = await search.listForDiagram(diagram.id);
		faults.afterIndex = true;
		await controller
			.renameProjectDiagram({
				diagramId: diagram.id,
				title: 'New indexed title',
				baseEtag: diagramEtag(diagram.id, diagram.currentRevision)
			})
			.catch(() => ({ kind: 'failure' }));
		expect({
			diagram: await controller.getProjectDiagram({ diagramId: diagram.id }),
			search: await search.listForDiagram(diagram.id)
		}).toEqual({ diagram, search: before });
	});
	it('rolls back both the draft and its staged search rows after an indexing failure', async () => {
		const { controller, diagram, search, faults } = await setup('9781');
		const before = await search.listForDiagram(diagram.id);
		faults.afterIndex = true;
		await controller
			.saveProjectDiagramDraft({
				diagramId: diagram.id,
				source,
				baseEtag: diagramEtag(diagram.id, diagram.currentRevision)
			})
			.catch(() => undefined);
		expect({
			diagram: await controller.getProjectDiagram({ diagramId: diagram.id }),
			search: await search.listForDiagram(diagram.id)
		}).toEqual({ diagram, search: before });
	});
	it('rolls back a trash move and the removed search rows after an indexing failure', async () => {
		const { controller, diagram, search, faults } = await setup('9782');
		const before = await search.listForDiagram(diagram.id);
		faults.afterIndex = true;
		await controller.archiveProjectDiagram({ diagramId: diagram.id }).catch(() => undefined);
		expect({
			diagram: await controller.getProjectDiagram({ diagramId: diagram.id }),
			search: await search.listForDiagram(diagram.id)
		}).toEqual({ diagram, search: before });
	});
	it('retains a trashed diagram and its absent search rows when restoration fails', async () => {
		const { controller, diagram, search, faults } = await setup('9783');
		const archived = await controller.archiveProjectDiagram({ diagramId: diagram.id });
		faults.afterIndex = true;
		await controller.restoreProjectDiagram({ diagramId: diagram.id }).catch(() => undefined);
		expect({
			diagram: await controller.getProjectDiagram({ diagramId: diagram.id }),
			search: await search.listForDiagram(diagram.id)
		}).toEqual({ diagram: archived, search: [] });
	});
	it('acknowledges the normalized draft and does not apply a replay twice', async () => {
		const { controller, diagram, baseEtag } = await setup('9361');
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'saveDiagram' as const, diagramId: diagram.id, source }
		};
		const first = await controller.synchronize(input);
		const replay = await controller.synchronize(input);
		const saved = await controller.getProjectDiagram({ diagramId: diagram.id });
		expect({
			sameReceipt: JSON.stringify(first) === JSON.stringify(replay),
			revision: saved.kind === 'drawio' ? saved.currentRevision : null,
			labels: saved.searchableText
		}).toEqual({ sameReceipt: true, revision: 2, labels: 'Offline edit' });
	});
	it('retains another client edit when the device submits an older diagram version', async () => {
		const { controller, diagram, baseEtag } = await setup('9362');
		await context.client`update diagrams set title = 'Other client' where id = ${diagram.id}`;
		const result = await controller.synchronize({
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'renameDiagram', diagramId: diagram.id, title: 'Offline title' }
		});
		expect({
			kind: result.kind,
			title: (await controller.getProjectDiagram({ diagramId: diagram.id })).title
		}).toEqual({ kind: 'conflict', title: 'Other client' });
	});
	it('records publication once when the response is lost', async () => {
		const { controller, diagram, baseEtag } = await setup('9363');
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: {
				kind: 'publishDiagram' as const,
				diagramId: diagram.id,
				source,
				renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Offline edit</text></svg>'
			}
		};
		await controller.synchronize(input);
		await controller.synchronize(input);
		expect(
			await context.client`select revision from diagram_revisions where diagram_id = ${diagram.id}`
		).toEqual([{ revision: 2 }]);
	});
	it('returns an authoritative tombstone after a guarded permanent deletion', async () => {
		const { controller, diagram, sync } = await setup('9364');
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		const base = await sync.objects.read({ type: 'diagrams', id: [diagram.id] }, null);
		if (base.kind !== 'found') throw new Error('Expected the trashed diagram');
		const result = await controller.synchronize({
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: { kind: 'deleteDiagram', diagramId: diagram.id }
		});
		expect(result.kind === 'applied' ? result.receipt.resource.kind : result.kind).toBe('deleted');
	});
});
