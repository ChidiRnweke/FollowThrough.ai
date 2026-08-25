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
import { testActor, testConversationId } from '$lib/testing/workspace/fixtures/domain-builders';
import {
	drawioBuilder,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const library = new DiagramLibrary(
		diagrams,
		new InMemoryNoteRepository(),
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjects()
	);
	return {
		diagrams,
		controller: new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				diagramFinder: library,
				diagramDraftWriter: library,
				diagramConversations: library,
				// Indexing is a downstream effect, not part of what these tests state.
				diagramIndexer: { index: async () => {} },
				drawioXmlValidator: { validate: (source: string) => source },
				drawioTextExtractor: { extract: async () => 'Ingest Index Answer' }
			})
		)
	};
};

describe('Presenting a diagram on the studio canvas', () => {
	it('reports an empty canvas as an explicit state', async () => {
		const controller = new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				canvasSource: new PresentedCanvasSource(new InMemoryAgentSessionRepository())
			})
		);

		expect(
			await controller.readCanvasDiagram(testActor(), { conversationId: testConversationId() })
		).toMatchObject({ kind: 'empty', nextActions: [{ tool: 'create_diagram' }] });
	});

	// The canvas shows what the agent drew; nothing is written until the user keeps
	// it, which is what stops an abandoned conversation leaving a row behind.
	it('returns the draft without storing it', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			conversationId: testConversationId()
		});
		expect(diagrams.diagrams).toEqual([]);
	});

	it('presents the source it was given', async () => {
		const { controller } = setup();
		const result = await controller.createDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			conversationId: testConversationId()
		});
		expect(result.source).toBe(VALID_DRAWIO_XML);
	});

	it('validates draw.io XML before the canvas tries to load it', async () => {
		const controller = new DiagramStudio(
			capabilityDependencies<DiagramStudioDependencies>({
				diagramConversations: { findByConversation: async () => undefined },
				drawioXmlValidator: {
					validate: () => {
						throw new Error('bad xml');
					}
				}
			})
		);
		await expect(
			controller.createDiagram(testActor(), {
				source: '<mxfile/>',
				conversationId: testConversationId()
			})
		).rejects.toThrow();
	});

	// A conversation keeps at most one diagram, so once it has one a "new" diagram
	// is really a change to that one. Accepting it silently is what produced the
	// original defect: the draft had no row and no tab, the canvas went on showing
	// the saved diagram, and the agent reported a change nobody could see.
	it('refuses a new diagram once the conversation already has one', async () => {
		const { controller, diagrams } = setup();
		const conversationId = testConversationId();
		diagrams.diagrams = [drawioBuilder({ conversationId })];
		await expect(
			controller.createDiagram(testActor(), { source: VALID_DRAWIO_XML, conversationId })
		).rejects.toThrow('edit_diagram');
	});

	it('carries the diagram a revision is meant to replace', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder();
		diagrams.diagrams = [target];
		const result = await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id,
			conversationId: testConversationId()
		});
		expect(result.diagramId).toBe(target.id);
	});

	// A revision lands on the row it names. It used to only echo, leaving the write
	// to a button in a canvas the user could not reach once the diagram was kept —
	// so the agent could report a diagram changed and change nothing.
	it('saves a revision onto the diagram it names', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id,
			conversationId: testConversationId()
		});
		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);
	});

	// ADR 0003: the write is a working revision, so publishing stays the user's
	// decision even though the agent no longer needs a gesture to be seen.
	it('leaves what the user published untouched', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		await controller.editDiagram(testActor(), {
			source: VALID_DRAWIO_XML,
			diagramId: target.id,
			conversationId: testConversationId()
		});
		expect(diagrams.diagrams[0]).toMatchObject({
			publishedRevision: target.publishedRevision
		});
	});

	it('rejects a revision target that the actor cannot read', async () => {
		const { controller } = setup();
		await expect(
			controller.editDiagram(testActor(), {
				source: VALID_DRAWIO_XML,
				diagramId: drawioBuilder().id,
				conversationId: testConversationId()
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
