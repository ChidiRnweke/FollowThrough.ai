import { describe, expect, it } from 'vitest';
import type { DiagramId } from '$lib/models/diagrams';
import {
	DiagramStudio,
	type DiagramStudioDependencies
} from '$lib/server/controllers/diagram-studio/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { createProjectsCapability } from '$lib/server/factories/capabilities/projects-capability-factory';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import {
	DrawioXmlValidator,
	DrawioSvgSanitizer,
	DrawioDiagramTextExtractor
} from '$lib/server/services/diagrams/drawio';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { context, seedNote } from '../database-harness';

const source =
	'<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Offline edit" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const projects = createProjectsCapability({ db: database });
	const notes = createNotesCapability({ db: database, projects: projects.repository });
	const records = new DiagramRecords(database);
	const library = new DiagramLibrary(
		records,
		notes.repository,
		notes.anchors,
		notes.provenanceRepository,
		projects.catalog
	);
	const diagram = drawioBuilder({
		id: crypto.randomUUID() as DiagramId,
		userId: seeded.owner.userId,
		projectId: seeded.project.id,
		sourceNoteId: seeded.note.id
	});
	await records.insert(seeded.owner, diagram);
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			syncMutations: sync.mutations,
			transactionRunner,
			diagramFinder: library,
			diagramDraftWriter: library,
			diagramRenamer: library,
			diagramDeleter: library,
			diagramArchiver: library,
			diagramIndexer: { index: async () => undefined },
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioTextExtractor: new DrawioDiagramTextExtractor()
		})
	);
	const base = await sync.objects.read(seeded.owner, { type: 'diagrams', id: [diagram.id] }, null);
	if (base.kind !== 'found') throw new Error('Expected the created diagram');
	return { ...seeded, controller, sync, diagram, baseEtag: base.snapshot.etag };
};

describe('diagram edits through the shared mutation boundary', () => {
	it('acknowledges the normalized draft and does not apply a replay twice', async () => {
		const { owner, controller, diagram, baseEtag } = await setup('9361');
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'saveDiagram' as const, diagramId: diagram.id, source }
		};
		const first = await controller.synchronize(owner, input);
		const replay = await controller.synchronize(owner, input);
		const saved = await controller.getProjectDiagram(owner, { diagramId: diagram.id });
		expect({
			sameReceipt: JSON.stringify(first) === JSON.stringify(replay),
			revision: saved.kind === 'drawio' ? saved.currentRevision : null,
			labels: saved.searchableText
		}).toEqual({ sameReceipt: true, revision: 2, labels: 'Offline edit' });
	});
	it('retains another client edit when the device submits an older diagram version', async () => {
		const { owner, controller, diagram, baseEtag } = await setup('9362');
		await context.client`update diagrams set title = 'Other client' where id = ${diagram.id}`;
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'renameDiagram', diagramId: diagram.id, title: 'Offline title' }
		});
		expect({
			kind: result.kind,
			title: (await controller.getProjectDiagram(owner, { diagramId: diagram.id })).title
		}).toEqual({ kind: 'conflict', title: 'Other client' });
	});
	it('records publication once when the response is lost', async () => {
		const { owner, controller, diagram, baseEtag } = await setup('9363');
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
		await controller.synchronize(owner, input);
		await controller.synchronize(owner, input);
		expect(
			await context.client`select revision from diagram_revisions where diagram_id = ${diagram.id}`
		).toEqual([{ revision: 2 }]);
	});
	it('returns an authoritative tombstone after a guarded permanent deletion', async () => {
		const { owner, controller, diagram, baseEtag } = await setup('9364');
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'deleteDiagram', diagramId: diagram.id }
		});
		expect(result.kind === 'applied' ? result.receipt.resource.kind : result.kind).toBe('deleted');
	});
});
