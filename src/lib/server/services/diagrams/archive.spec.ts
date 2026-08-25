import { describe, expect, it } from 'vitest';
import { DiagramLibrary } from './library';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';

const setup = () => {
	const diagrams = new InMemoryDiagramRepository();
	return {
		diagrams,
		library: new DiagramLibrary(
			diagrams,
			new InMemoryNoteRepository(),
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
});
