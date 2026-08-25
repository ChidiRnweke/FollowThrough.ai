import { describe, expect, it } from 'vitest';
import { DiagramLibrary } from './library';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	testActor,
	testConversationId,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	const notes = new InMemoryNoteRepository();
	return {
		diagrams,
		notes,
		library: new DiagramLibrary(
			diagrams,
			notes,
			new InMemoryAnchorRepository(),
			new InMemoryProvenanceRepository(),
			new InMemoryProjects()
		)
	};
};

// Removal used to be permanent and immediate. That is a poor match for something a
// conversation can produce: the cost of an unwanted diagram has to be recoverable
// before it is reasonable to let an agent create one at all.
describe('Diagram soft delete', () => {
	it('marks an archived diagram as trashed rather than removing it', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		expect(diagrams.diagrams).toHaveLength(1);
	});

	it('lists an archived diagram in the trash', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		expect(await library.listArchived(testActor())).toHaveLength(1);
	});

	it('takes a restored diagram back out of the trash', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		await library.unarchive(testActor(), diagram.id);
		expect(await library.listArchived(testActor())).toHaveLength(0);
	});

	it('refuses to archive a diagram that is already in the trash', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		await expect(library.archive(testActor(), diagram.id)).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('refuses to restore a diagram that is not in the trash', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await expect(library.unarchive(testActor(), diagram.id)).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	// The defect this whole block exists for: archiving marked the row and hid it
	// from nothing, so the gallery still listed it. Pressing "Move to trash" again
	// then failed, because the diagram was already there.
	it('takes an archived diagram out of the project listing', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		const listed = await library.listForProject(testActor(), diagram.projectId);
		expect(listed.diagrams).toHaveLength(0);
	});

	it('stops counting an archived diagram', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		expect(await library.countForProject(testActor(), diagram.projectId)).toBe(0);
	});

	it('puts a restored diagram back in the project listing', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder();
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		await library.unarchive(testActor(), diagram.id);
		const listed = await library.listForProject(testActor(), diagram.projectId);
		expect(listed.diagrams).toHaveLength(1);
	});

	// The gallery's confirmation promises a note shows the diagram as unavailable
	// until it is restored, so the note's own listing has to agree.
	it('takes an archived diagram out of its note listing', async () => {
		const { library, diagrams, notes } = setup();
		// The note has to exist: listing a note's diagrams verifies the note first.
		notes.notes = [noteBuilder({ id: testNoteId() })];
		const diagram = drawioBuilder({ sourceNoteId: testNoteId() });
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		expect(await library.listForNote(testActor(), testNoteId())).toHaveLength(0);
	});

	// Otherwise `create_diagram` refuses a new diagram by naming one the user threw
	// away, which is worse than the guess that refusal replaced.
	it('treats a conversation whose diagram is archived as having none', async () => {
		const { library, diagrams } = setup();
		const diagram = drawioBuilder({ conversationId: testConversationId() });
		diagrams.diagrams = [diagram];
		await library.archive(testActor(), diagram.id);
		expect(await library.findByConversation(testActor(), testConversationId())).toBeUndefined();
	});
});
