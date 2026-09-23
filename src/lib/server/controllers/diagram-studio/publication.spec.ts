import { describe, expect, it } from 'vitest';
import { diagramEtag, type DiagramWriteOutcome } from '$lib/models/diagrams';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { diagramRevisionFixture } from '$lib/testing/diagrams/fixtures/revision-editing';

const savedDiagram = (result: DiagramWriteOutcome) => {
	if (result.outcome !== 'saved') throw new Error('Expected a saved diagram');
	return result.diagram;
};

describe('Diagram publication invariants', () => {
	it('trims a renamed diagram title', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const result = await controller
			.renameProjectDiagram(testActor(), {
				diagramId: diagram.id,
				title: '  Architecture  ',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(result.title).toBe('Architecture');
	});

	it('rejects an empty renamed diagram title', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(
			controller.renameProjectDiagram(testActor(), {
				diagramId: diagram.id,
				title: '   ',
				baseEtag: diagramEtag(diagram)
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('rejects another diagram ETag even when the submitted source already matches', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const foreign = drawioBuilder({
			id: 'b0000000-0000-4000-8000-000000000001' as typeof diagram.id
		});
		await expect(
			controller
				.saveProjectDiagramDraft(testActor(), {
					diagramId: diagram.id,
					source: diagram.source,
					baseEtag: diagramEtag(foreign)
				})
				.then(savedDiagram)
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('acknowledges a draft save retried after its response was lost', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const saved = await controller
			.saveProjectDiagramDraft(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>new</mxfile>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(
			await controller
				.saveProjectDiagramDraft(testActor(), {
					diagramId: diagram.id,
					source: saved.source,
					baseEtag: diagramEtag(diagram)
				})
				.then(savedDiagram)
		).toEqual(saved);
	});

	it('acknowledges a rename retried after its response was lost', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const saved = await controller
			.renameProjectDiagram(testActor(), {
				diagramId: diagram.id,
				title: 'New title',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(
			await controller
				.renameProjectDiagram(testActor(), {
					diagramId: diagram.id,
					title: 'New title',
					baseEtag: diagramEtag(diagram)
				})
				.then(savedDiagram)
		).toEqual(saved);
	});

	it('preserves the original publication when a retry exports a different preview', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({ publishedRevision: 0 });
		diagrams.diagrams = [diagram];
		const saved = await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>new</mxfile>',
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(
			await controller
				.publishProjectDiagram(testActor(), {
					diagramId: diagram.id,
					source: saved.source,
					renderedSvg: '<svg>regenerated</svg>',
					baseEtag: diagramEtag(diagram)
				})
				.then(savedDiagram)
		).toEqual(saved);
	});

	it('does not append another snapshot for a repeated publish', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({ publishedRevision: 0 });
		diagrams.diagrams = [diagram];
		await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: diagram.source,
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: diagram.source,
				renderedSvg: '<svg>regenerated</svg>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(diagrams.diagramRevisions).toHaveLength(1);
	});

	it('restores a published snapshot as a retry-safe draft', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({ publishedRevision: 0 });
		diagrams.diagrams = [diagram];
		const published = await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: diagram.source,
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		const snapshot = diagrams.diagramRevisions[0]!;
		const edited = await controller
			.saveProjectDiagramDraft(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>new</mxfile>',
				baseEtag: diagramEtag(published)
			})
			.then(savedDiagram);
		const restored = await controller
			.restoreDiagramRevision(testActor(), {
				diagramId: diagram.id,
				revisionId: snapshot.id,
				baseEtag: diagramEtag(edited)
			})
			.then(savedDiagram);
		const retried = await controller
			.restoreDiagramRevision(testActor(), {
				diagramId: diagram.id,
				revisionId: snapshot.id,
				baseEtag: diagramEtag(edited)
			})
			.then(savedDiagram);
		expect({ restored, retried, snapshots: diagrams.diagramRevisions.length }).toMatchObject({
			restored: {
				currentRevision: edited.currentRevision + 1,
				publishedRevision: published.publishedRevision,
				source: diagram.source
			},
			retried: restored,
			snapshots: 1
		});
	});

	it('rejects a stale publish while keeping the newer draft', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({ currentRevision: 2, publishedRevision: 1 });
		diagrams.diagrams = [diagram];
		await expect(
			controller.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>other</mxfile>',
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(drawioBuilder())
			})
		).resolves.toMatchObject({ outcome: 'conflict' });
	});

	it('autosaves source as an unpublished revision', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		const saved = await controller
			.saveProjectDiagramDraft(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>draft</mxfile>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(saved.currentRevision > saved.publishedRevision).toBe(true);
	});

	it('publishing records an immutable snapshot', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({
			currentRevision: 2,
			publishedRevision: 1,
			source: '<mxfile>draft</mxfile>'
		});
		diagrams.diagrams = [diagram];
		await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: diagram.source,
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(diagrams.diagramRevisions).toHaveLength(1);
	});

	it('publishing advances the published revision', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({
			currentRevision: 2,
			publishedRevision: 1,
			source: '<mxfile>draft</mxfile>'
		});
		diagrams.diagrams = [diagram];
		const published = await controller
			.publishProjectDiagram(testActor(), {
				diagramId: diagram.id,
				source: diagram.source,
				renderedSvg: '<svg/>',
				baseEtag: diagramEtag(diagram)
			})
			.then(savedDiagram);
		expect(published.publishedRevision).toBe(2);
	});

	it('rejects a stale draft write', async () => {
		const { controller, diagrams } = diagramRevisionFixture();
		const diagram = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [diagram];
		await expect(
			controller.saveProjectDiagramDraft(testActor(), {
				diagramId: diagram.id,
				source: '<mxfile>draft</mxfile>',
				baseEtag: diagramEtag(drawioBuilder())
			})
		).resolves.toMatchObject({ outcome: 'conflict' });
	});
});
