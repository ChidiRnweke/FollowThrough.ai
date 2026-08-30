import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	projectBuilder,
	testActor,
	testConversationId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const projects = new InMemoryProjects();
	// A diagram is created in a project, and creating one verifies the project is
	// there — the same rule that stopped notes being filed wherever sorted first.
	projects.projects = [projectBuilder({ id: testProjectId() })];
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		projects
	);
	return {
		diagrams,
		controller: new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				diagramFinder: library,
				diagramDraftWriter: library,
				diagramConversations: library,
				diagramWriter: library,
				now: () => testNow,
				// Indexing is a downstream effect, not part of what these tests state.
				diagramIndexer: { index: async () => {} },
				drawioXmlValidator: { validate: (source: string) => source },
				drawioTextExtractor: { extract: async () => 'Ingest Index Answer' }
			})
		)
	};
};

describe('Creating a diagram', () => {
	const creating = () => ({
		source: VALID_DRAWIO_XML,
		projectId: testProjectId(),
		conversationId: testConversationId()
	});

	// It used to store nothing and hand the XML back for a canvas to show, so a
	// diagram was the one agent output that could vanish when a chat closed.
	it('writes the diagram it was asked to create', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), creating());
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('answers with the diagram it created', async () => {
		const { controller, diagrams } = setup();
		const output = await controller.createDiagram(testActor(), creating());
		expect(output.diagramId).toBe(diagrams.diagrams[0]?.id);
	});

	it('stores the source it was given', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), creating());
		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);
	});

	// Publishing stays the user's decision, exactly as it does for a note, which is
	// also born at published revision 0.
	it('creates the diagram unpublished', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), creating());
		expect(diagrams.diagrams[0]).toMatchObject({ publishedRevision: 0 });
	});

	// Only the draw.io embed can draw a preview, so the row waits for the canvas
	// rather than storing a blank one it could never tell apart from a real one.
	it('creates the diagram with no preview yet', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), creating());
		expect(diagrams.diagrams[0]?.renderedSvg).toBeUndefined();
	});

	// A chat is provenance, not ownership. Asking one conversation for two diagrams
	// used to be refused because the row was unique on the conversation.
	it('lets one conversation create more than one diagram', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), creating());
		await controller.createDiagram(testActor(), creating());
		expect(diagrams.diagrams).toHaveLength(2);
	});

	it('validates draw.io XML before storing it', async () => {
		const controller = new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				drawioXmlValidator: {
					validate: () => {
						throw new Error('bad xml');
					}
				}
			})
		);
		await expect(controller.createDiagram(testActor(), creating())).rejects.toThrow();
	});
});

describe('Editing a diagram', () => {
	it('writes the new source onto the diagram it names', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id
		});
		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);
	});

	it('answers with the diagram it edited', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		const output = await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id
		});
		expect(output.diagramId).toBe(target.id);
	});

	// ADR 0003: the write is a working revision, so publishing stays the user's
	// decision even though the agent no longer needs a gesture to be seen.
	it('leaves what the user published untouched', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id
		});
		expect(diagrams.diagrams[0]).toMatchObject({
			publishedRevision: target.publishedRevision
		});
	});

	it('rejects a diagram the actor cannot read', async () => {
		const { controller } = setup();
		await expect(
			controller.editDiagram(testActor(), {
				source: VALID_DRAWIO_XML,
				diagramId: drawioBuilder().id
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
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

	it('returns the project needed to derive its virtual path', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ source: VALID_DRAWIO_XML });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(result.projectId).toBe(diagram.projectId);
	});
});
