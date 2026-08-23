import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository()
	);
	return {
		diagrams,
		controller: new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				diagramFinder: library,
				drawioXmlValidator: { validate: (source: string) => source },
				drawioTextExtractor: { extract: async () => 'Ingest Index Answer' }
			})
		)
	};
};

describe('Presenting a diagram on the studio canvas', () => {
	// The canvas shows what the agent drew; nothing is written until the user keeps
	// it, which is what stops an abandoned conversation leaving a row behind.
	it('returns the draft without storing it', async () => {
		const { controller, diagrams } = setup();
		await controller.presentDiagram(testActor(), { source: VALID_DRAWIO_XML });
		expect(diagrams.diagrams).toEqual([]);
	});

	it('presents the source it was given', async () => {
		const { controller } = setup();
		const result = await controller.presentDiagram(testActor(), { source: VALID_DRAWIO_XML });
		expect(result.source).toBe(VALID_DRAWIO_XML);
	});

	it('validates draw.io XML before the canvas tries to load it', async () => {
		const controller = new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				drawioXmlValidator: {
					validate: () => {
						throw new Error('bad xml');
					}
				}
			})
		);
		await expect(controller.presentDiagram(testActor(), { source: '<mxfile/>' })).rejects.toThrow();
	});

	it('carries the diagram a revision is meant to replace', async () => {
		const { controller } = setup();
		const result = await controller.presentDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: drawioBuilder().id
		});
		expect(result.diagramId).toBe(drawioBuilder().id);
	});

	it('stores nothing even when it is a revision of something saved', async () => {
		const { controller, diagrams } = setup();
		await controller.presentDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: drawioBuilder().id
		});
		expect(diagrams.diagrams).toEqual([]);
	});
});

describe('Reading a saved diagram', () => {
	// The agent gets the labels, never the XML: a draw.io file is thousands of
	// tokens of markup that tells a model nothing it can use.
	it('returns the labels of a draw.io diagram rather than its XML', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ source: VALID_DRAWIO_XML });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(result.labels).not.toContain('mxfile');
	});

	it('returns a Mermaid diagram’s source as its labels', async () => {
		const { controller, diagrams } = setup();
		const diagram = mermaidBuilder();
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(result.labels).toBe(diagram.source);
	});

	it('names the diagram it read', async () => {
		const { controller, diagrams } = setup();
		const diagram = mermaidBuilder({ title: 'Ingest pipeline' });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(result.title).toBe('Ingest pipeline');
	});

	// The one time the XML earns its place: a revision has to be written against
	// the real thing rather than against a list of labels.
	it('hands over draw.io XML when it was asked for', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ source: VALID_DRAWIO_XML });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), {
			diagramId: diagram.id,
			includeSource: true
		});
		expect(result.source).toBe(VALID_DRAWIO_XML);
	});

	it('withholds the XML by default', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ source: VALID_DRAWIO_XML });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(result.source).toBeUndefined();
	});
});
