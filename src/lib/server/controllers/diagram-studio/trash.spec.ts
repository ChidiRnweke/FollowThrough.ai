import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { DiagramStudio, type DiagramStudioDependencies } from './controller';
import { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	drawioBuilder,
	InMemoryDiagrams
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { prepareWorkspaceCommand } from '$lib/controllers/workspace/commands';
import {
	testNow,
	testNoteId,
	testConversationId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { DateTime } from '$lib/models/workspace';
const timestamp = '2026-09-23T12:00:00.000Z' as DateTime;

const setup = () => {
	const sourceNotes = new InMemoryNoteContent();
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagramRepository();
	const index = new InMemoryDiagrams();
	const notes = new InMemoryNoteRepository();
	const library = new DiagramLibrary(
		diagrams,
		notes,
		new InMemoryAnchorRepository(),
		new InMemoryProvenanceRepository(),
		new InMemoryProjectRepository()
	);
	const controller = new DiagramStudio(
		capabilityDependencies<DiagramStudioDependencies>({
			diagramSourceNotes: sourceNotes,
			diagramFinder: library,
			diagramDraftWriter: library,
			diagramTrash: library,
			now: () => timestamp,
			transactionRunner: new InMemoryTransactionRunner([diagrams, index]),
			diagramIndexer: index,
			drawioXmlValidator: { validate: (source) => source },
			drawioTextExtractor: { extract: async () => 'labels' },
			drawioSvgSanitizer: { sanitize: (svg) => svg }
		})
	);
	return { diagrams, controller, index, library, notes };
};

describe('diagram trash transitions', () => {
	it('requires trashing a diagram before permanent deletion', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(
			controller.deleteProjectDiagram(testActor(), { diagramId: diagram.id })
		).rejects.toThrow('not in the trash');
	});
	it('deletes an owned diagram after it is trashed', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		await controller.deleteProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(diagrams.diagrams).toEqual([]);
	});
	it('refuses a second archive', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ archivedAt: testNow });
		diagrams.diagrams = [diagram];
		await expect(
			controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id })
		).rejects.toThrow('already in the trash');
	});
	it('refuses restoring an active diagram', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(
			controller.restoreProjectDiagram(testActor(), { diagramId: diagram.id })
		).rejects.toThrow('not in the trash');
	});
	it('does not expose another actor’s diagram', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder({ userId: testActor(2).userId });
		diagrams.diagrams = [diagram];
		await expect(
			controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it('does not restore a deleted diagram', async () => {
		const { controller } = setup();
		await expect(
			controller.restoreProjectDiagram(testActor(), { diagramId: drawioBuilder().id })
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
			const local = prepareWorkspaceCommand(
				command,
				{ type: 'diagrams', value: diagram },
				{
					userId: testActor().userId,
					now: timestamp,
					records: new Map(),
					inventory: 'complete'
				}
			).local;
			const stored =
				action === 'archive'
					? await controller.archiveProjectDiagram(testActor(), command)
					: await controller.restoreProjectDiagram(testActor(), command);
			expect({ type: 'diagrams', value: stored }).toEqual(local);
		}
	);
});

describe('Diagram soft delete', () => {
	it('marks an archived diagram as trashed rather than removing it', async () => {
		const { controller, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(diagrams.diagrams).toEqual([
			{ ...diagram, archivedAt: timestamp, updatedAt: timestamp }
		]);
	});

	it('lists an archived diagram in the trash', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(await library.listArchived(testActor())).toHaveLength(1);
	});

	it('takes a restored diagram back out of the trash', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		await controller.restoreProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(await library.listArchived(testActor())).toHaveLength(0);
	});

	// The defect this whole block exists for: archiving marked the row and hid it
	// from nothing, so the gallery still listed it. Pressing "Move to trash" again
	// then failed, because the diagram was already there.
	it('takes an archived diagram out of the project listing', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		const listed = await library.listForProject(testActor(), diagram.projectId);
		expect(listed.diagrams).toHaveLength(0);
	});

	it('stops counting an archived diagram', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(await library.countForProject(testActor(), diagram.projectId)).toBe(0);
	});

	it('puts a restored diagram back in the project listing', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		await controller.restoreProjectDiagram(testActor(), { diagramId: diagram.id });
		const listed = await library.listForProject(testActor(), diagram.projectId);
		expect(listed.diagrams).toHaveLength(1);
	});

	// The gallery's confirmation promises a note shows the diagram as unavailable
	// until it is restored, so the note's own listing has to agree.
	it('takes an archived diagram out of its note listing', async () => {
		const { controller, library, diagrams, notes } = setup();
		// The note has to exist: listing a note's diagrams verifies the note first.
		notes.notes = [noteBuilder({ id: testNoteId() })];
		const diagram = drawioBuilder({ sourceNoteId: testNoteId() });
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(await library.listForNote(testActor(), testNoteId())).toHaveLength(0);
	});

	// Otherwise `create_diagram` refuses a new diagram by naming one the user threw
	// away, which is worse than the guess that refusal replaced.
	it('treats a conversation whose diagram is archived as having none', async () => {
		const { controller, library, diagrams } = setup();
		const diagram = drawioBuilder({ conversationId: testConversationId() });
		diagrams.diagrams = [diagram];
		await controller.archiveProjectDiagram(testActor(), { diagramId: diagram.id });
		expect(await library.findByConversation(testActor(), testConversationId())).toBeUndefined();
	});
});
