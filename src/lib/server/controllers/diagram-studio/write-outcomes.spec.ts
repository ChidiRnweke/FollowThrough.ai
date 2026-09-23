import { describe, expect, it } from 'vitest';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { diagramEtag } from '$lib/models/diagrams';
import { diagramRevisionFixture as setup } from '$lib/testing/diagrams/fixtures/revision-editing';

describe('Diagram write outcomes', () => {
	it('rolls back a rename when updating its search entries fails', async () => {
		const { diagrams, controller, index } = setup();
		const original = drawioBuilder();
		diagrams.diagrams = [original];
		index.failIndex = true;
		await controller
			.renameProjectDiagram(testActor(), {
				diagramId: original.id,
				title: 'Renamed diagram',
				baseEtag: diagramEtag(original)
			})
			.catch(() => ({ kind: 'failure' }));
		expect(diagrams.diagrams).toEqual([original]);
	});
	it('retains the original draft when indexing its replacement fails', async () => {
		const { diagrams, controller, index } = setup();
		const original = drawioBuilder();
		diagrams.diagrams = [original];
		index.failIndex = true;
		await controller
			.saveProjectDiagramDraft(testActor(), {
				diagramId: original.id,
				source: '<mxfile>replacement</mxfile>',
				baseEtag: diagramEtag(original)
			})
			.catch(() => undefined);
		expect(diagrams.diagrams).toEqual([original]);
	});
	it('retains an active diagram when removing its search entries fails', async () => {
		const { diagrams, controller, index } = setup();
		const original = drawioBuilder();
		diagrams.diagrams = [original];
		index.failIndex = true;
		await controller
			.archiveProjectDiagram(testActor(), { diagramId: original.id })
			.catch(() => undefined);
		expect(diagrams.diagrams).toEqual([original]);
	});
	it('retains a trashed diagram when restoring its search entries fails', async () => {
		const { diagrams, controller, index } = setup();
		const original = drawioBuilder({ archivedAt: drawioBuilder().createdAt });
		diagrams.diagrams = [original];
		index.failIndex = true;
		await controller
			.restoreProjectDiagram(testActor(), { diagramId: original.id })
			.catch(() => undefined);
		expect(diagrams.diagrams).toEqual([original]);
	});
	it('returns the authoritative version for a conflicting draft save', async () => {
		const { diagrams, controller } = setup();
		const remote = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [remote];
		const baseEtag = diagramEtag(drawioBuilder());
		expect(
			await controller.saveProjectDiagramDraft(testActor(), {
				diagramId: remote.id,
				source: '<mxfile>different</mxfile>',
				baseEtag
			})
		).toEqual({
			outcome: 'conflict',
			baseEtag,
			remote: { diagram: remote, etag: diagramEtag(remote) }
		});
	});

	it('returns a saved outcome for a lost draft acknowledgment', async () => {
		const { diagrams, controller } = setup();
		const remote = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [remote];
		expect(
			await controller.saveProjectDiagramDraft(testActor(), {
				diagramId: remote.id,
				source: remote.source,
				baseEtag: diagramEtag(drawioBuilder())
			})
		).toEqual({ outcome: 'saved', diagram: remote, etag: diagramEtag(remote) });
	});

	it('returns a conflict for a stale rename', async () => {
		const { diagrams, controller } = setup();
		const remote = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [remote];
		expect(
			(
				await controller.renameProjectDiagram(testActor(), {
					diagramId: remote.id,
					title: 'Different',
					baseEtag: diagramEtag(drawioBuilder())
				})
			).outcome
		).toBe('conflict');
	});

	it('returns a conflict for a stale publish', async () => {
		const { diagrams, controller } = setup();
		const remote = drawioBuilder({ currentRevision: 2 });
		diagrams.diagrams = [remote];
		expect(
			(
				await controller.publishProjectDiagram(testActor(), {
					diagramId: remote.id,
					source: '<mxfile>different</mxfile>',
					renderedSvg: '<svg/>',
					baseEtag: diagramEtag(drawioBuilder())
				})
			).outcome
		).toBe('conflict');
	});
});
