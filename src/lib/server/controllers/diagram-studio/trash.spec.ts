import type { DateTime } from '$lib/models/workspace';
import { DiagramLibraryService } from '$lib/server/services/diagrams/library';
import { DiagramRuleService } from '$lib/services/diagrams/editing';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
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
import { prepareWorkspaceCommand } from '$lib/testing/workspace/fixtures/commands';
import {
	noteBuilder,
	testActor,
	testConversationId,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
const timestamp = '2026-09-23T12:00:00.000Z' as DateTime;
const setup = () => {
	const sourceNotes = new InMemoryNoteContent(testActor());
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagramRepository(testActor());
	const index = new InMemoryDiagrams(testActor());
	const notes = new InMemoryNoteRepository(testActor());
	const library = new DiagramLibraryService(
		testActor(),
		diagrams,
		notes,
		new InMemoryAnchorRepository(testActor()),
		new InMemoryProvenanceRepository(testActor()),
		new InMemoryProjectRepository(testActor())
	);
	const controller = new DiagramStudio(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<DiagramStudioDependencies>({
			...agentToolResultsFixture(),
			diagramRules: new DiagramRuleService(),
			diagramSourceNotes: sourceNotes,
			diagrams: library,
			now: () => timestamp,
			transactionRunner: new InMemoryTransactionRunner([diagrams, index]),
			diagramIndexer: index,
			drawio: { validate: (source) => source, read: () => ['labels'], sanitize: (svg) => svg },
			diagramLabelPresentation: new DiagramLabelPresentationService()
		})
	);
	return { diagrams, controller, index, library, notes };
};
describe('diagram trash transitions', () => {
	it('requires trashing a diagram before permanent deletion', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(controller.deleteProjectDiagram({ diagramId: diagram.id })).rejects.toThrow(
			'not in the trash'
		);
	});
	it('deletes an owned diagram after it is trashed', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		await controller.deleteProjectDiagram({ diagramId: diagram.id });
		expect(diagrams.diagrams).toEqual([]);
	});
	it('refuses a second archive', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ archivedAt: testNow });
		diagrams.diagrams = [diagram];
		await expect(controller.archiveProjectDiagram({ diagramId: diagram.id })).rejects.toThrow(
			'already in the trash'
		);
	});
	it('refuses restoring an active diagram', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(controller.restoreProjectDiagram({ diagramId: diagram.id })).rejects.toThrow(
			'not in the trash'
		);
	});
	it('does not expose another actor’s diagram', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ userId: testActor(2).userId });
		diagrams.diagrams = [diagram];
		await expect(controller.archiveProjectDiagram({ diagramId: diagram.id })).rejects.toMatchObject(
			{ code: 'NOT_FOUND' }
		);
	});
	it('does not restore a deleted diagram', async () => {
		const { controller } = setup();
		await expect(
			controller.restoreProjectDiagram({ diagramId: drawioBuilder().id })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it.each(['archive', 'restore'] as const)(
		'matches offline %s fields and timestamps',
		async (action) => {
			const { controller, diagrams } = setup();
			const diagram = drawioBuilder(action === 'restore' ? { archivedAt: testNow } : {});
			diagrams.diagrams = [diagram];
			const command = {
				kind: action === 'archive' ? 'archiveDiagram' : 'restoreDiagram',
				diagramId: diagram.id
			} as const;
			const local = (
				await prepareWorkspaceCommand(
					command,
					{ type: 'diagrams', value: diagram },
					{
						userId: testActor().userId,
						now: timestamp,
						records: new Map(),
						inventory: 'complete'
					}
				)
			).local;
			const stored =
				action === 'archive'
					? await controller.archiveProjectDiagram(command)
					: await controller.restoreProjectDiagram(command);
			expect({ type: 'diagrams', value: stored }).toEqual(local);
		}
	);
});
describe('Diagram soft delete', () => {
	it('takes a restored diagram back out of the trash', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		await controller.restoreProjectDiagram({ diagramId: diagram.id });
		expect(await library.listArchived()).toHaveLength(0);
		const listed = await library.listForProject(diagram.projectId);
		expect(listed.diagrams).toHaveLength(1);
	});
	// The defect this whole block exists for: archiving marked the row and hid it
	// from nothing, so the gallery still listed it. Pressing "Move to trash" again
	// then failed, because the diagram was already there.
	it('takes an archived diagram out of the project listing', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		const listed = await library.listForProject(diagram.projectId);
		expect(listed.diagrams).toHaveLength(0);
		expect(await library.listArchived()).toMatchObject([
			{ id: diagram.id, archivedAt: timestamp, updatedAt: timestamp }
		]);
		expect(await library.countForProject(diagram.projectId)).toBe(0);
	});
	// The gallery's confirmation promises a note shows the diagram as unavailable
	// until it is restored, so the note's own listing has to agree.
	it('takes an archived diagram out of its note listing', async () => {
		const { controller, library, diagrams, notes } = setup();
		// The note has to exist: listing a note's diagrams verifies the note first.
		notes.notes = [noteBuilder({ id: testNoteId() })];
		const diagram = drawioBuilder({ sourceNoteId: testNoteId() });
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		expect(await library.listForNote(testNoteId())).toHaveLength(0);
	});
	// Otherwise `create_diagram` refuses a new diagram by naming one the user threw
	// away, which is worse than the guess that refusal replaced.
	it('treats a conversation whose diagram is archived as having none', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder({ conversationId: testConversationId() });
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram({ diagramId: diagram.id });
		expect(await library.findByConversation(testConversationId())).toBeUndefined();
	});
});
