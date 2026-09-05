import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { diagramEtag } from '$lib/models/diagrams';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjects()
	);
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			diagramFinder: library,
			diagramDraftWriter: library,
			diagramRenamer: library,
			transactionRunner: new InMemoryTransactionRunner([]),
			diagramIndexer: { index: async () => {} },
			drawioXmlValidator: { validate: (source) => source },
			drawioTextExtractor: { extract: async () => 'labels' },
			drawioSvgSanitizer: { sanitize: (svg) => svg }
		})
	);
	return { diagrams, controller };
};

describe('Diagram write outcomes', () => {
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
