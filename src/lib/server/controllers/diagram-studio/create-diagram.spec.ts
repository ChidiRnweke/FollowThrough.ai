import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { DiagramLibraryService } from '$lib/server/services/diagrams/library';
import { DiagramRuleService } from '$lib/services/diagrams/editing';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testConversationId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';

const setup = (
	index: DiagramStudioDependencies['diagramIndexer']['indexDiagram'] = async () => {}
) => {
	const sourceNotes = new InMemoryNoteContent(testActor());
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagramRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor());
	// A diagram is created in a project, and creating one verifies the project is
	// there — the same rule that stopped notes being filed wherever sorted first.
	projects.projects = [projectBuilder({ id: testProjectId() })];
	const library = new DiagramLibraryService(
		testActor(),
		diagrams,
		new InMemoryNoteRepository(testActor()),
		new InMemoryAnchorRepository(testActor()),
		new InMemoryProvenanceRepository(testActor()),
		projects,
		testClock
	);
	return {
		diagrams,
		controller: new DiagramStudio(
			testActor(),
			new WorkspaceCommandRulesService(),
			capabilityDependencies<DiagramStudioDependencies>({
				...agentToolResultsFixture(),
				diagramRules: new DiagramRuleService(),
				diagramSourceNotes: sourceNotes,
				diagrams: library,
				transactionRunner: new InMemoryTransactionRunner([diagrams]),
				now: () => testNow,
				// Indexing is a downstream effect, not part of what these tests state.
				diagramIndexer: {
					diagramContextRequirement: (diagram) =>
						new InMemoryDiagrams(testActor()).diagramContextRequirement(diagram),
					indexDiagram: index
				},
				drawio: {
					validate: (source: string) => source,
					read: () => ['Ingest Index Answer'],
					sanitize: (svg: string) => svg
				},
				diagramLabelPresentation: new DiagramLabelPresentationService()
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
		const output = await controller.createDiagram(creating());
		expect(diagrams.diagrams).toHaveLength(1);

		expect(diagrams.diagrams[0]?.renderedSvg).toBeUndefined();

		expect(diagrams.diagrams[0]).toMatchObject({ publishedRevision: 0 });

		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);
		expect(output.diagramId).toBe(diagrams.diagrams[0]?.id);
	});

	// Publishing stays the user's decision, exactly as it does for a note, which is
	// also born at published revision 0.

	// Only the draw.io embed can draw a preview, so the row waits for the canvas
	// rather than storing a blank one it could never tell apart from a real one.

	// A chat is provenance, not ownership. Asking one conversation for two diagrams
	// used to be refused because the row was unique on the conversation.
	it('lets one conversation create more than one diagram', async () => {
		const { controller, diagrams } = setup();
		await controller.createDiagram(creating());
		await controller.createDiagram(creating());
		expect(diagrams.diagrams).toHaveLength(2);
	});

	it('validates draw.io XML before storing it', async () => {
		const controller = new DiagramStudio(
			testActor(),
			new WorkspaceCommandRulesService(),
			capabilityDependencies<DiagramStudioDependencies>({
				now: testClock,
				...agentToolResultsFixture(),
				diagramRules: new DiagramRuleService(),
				drawio: {
					validate: () => {
						throw new Error('bad xml');
					},
					sanitize: (svg: string) => svg,
					read: () => []
				}
			})
		);
		await expect(controller.createDiagram(creating())).rejects.toThrow();
	});
});

describe('Editing a diagram', () => {
	it('writes the new source onto the diagram it names', async () => {
		const { controller, diagrams } = setup();
		const target = drawioBuilder({ source: '<mxfile>before</mxfile>' });
		diagrams.diagrams = [target];
		const output = await controller.editDiagram({
			source: VALID_DRAWIO_XML,
			diagramId: target.id
		});
		expect(diagrams.diagrams[0]?.source).toBe(VALID_DRAWIO_XML);

		expect(diagrams.diagrams[0]).toMatchObject({
			publishedRevision: target.publishedRevision
		});
		expect(output.diagramId).toBe(target.id);
	});

	// ADR 0003: the write is a working revision, so publishing stays the user's
	// decision even though the agent no longer needs a gesture to be seen.

	it('rejects a diagram the actor cannot read', async () => {
		const { controller } = setup();
		await expect(
			controller.editDiagram({
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
		const result = await controller.readProjectDiagram({ diagramId: diagram.id });
		expect(result.labels).not.toContain('mxfile');

		expect(result.projectId).toBe(diagram.projectId);
	});

	it('returns a Mermaid diagram’s source as its labels', async () => {
		const { controller, diagrams } = setup();
		const diagram = mermaidBuilder();
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram({ diagramId: diagram.id });
		expect(result.labels).toBe(diagram.source);
	});

	it('names the diagram it read', async () => {
		const { controller, diagrams } = setup();
		const diagram = mermaidBuilder({ title: 'Ingest pipeline' });
		diagrams.diagrams = [diagram];
		const result = await controller.readProjectDiagram({ diagramId: diagram.id });
		expect(result.title).toBe('Ingest pipeline');
	});
});

it('does not retain a newly created diagram when indexing fails', async () => {
	const { controller, diagrams } = setup(async () => {
		throw new Error('Index unavailable');
	});
	const result = await controller
		.createDiagram({
			source: VALID_DRAWIO_XML,
			projectId: testProjectId(),
			conversationId: testConversationId()
		})
		.then(
			() => 'saved',
			() => 'failed'
		);
	expect({ result, diagrams: diagrams.diagrams }).toEqual({ result: 'failed', diagrams: [] });
});
