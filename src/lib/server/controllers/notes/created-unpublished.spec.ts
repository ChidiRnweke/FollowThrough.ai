import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { describe, expect, it } from 'vitest';
import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { createNoteServices } from '$lib/server/factories/capabilities/notes-capability-factory';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const records = new InMemoryNoteRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor(), records);
	projects.projects = [projectBuilder()];
	return {
		records,
		creation: noteCreationControllers(
			createNoteServices(
				testActor(),
				records,
				new InMemoryAnchorRepository(testActor()),
				projects,
				testClock
			).creator,
			new InMemoryTransactionRunner([records, projects])
		)
	};
};
// ADR 0003: approving an agent's write does not publish it; publishing stays a separate decision.
// The diagram half is proven by diagram-studio/create-diagram.spec.ts ('writes the diagram it was asked to create').
describe('Notes created through the agent tool path', () => {
	it('start unpublished', async () => {
		const { creation } = setup();
		const { note } = await creation.notes.create({
			projectId: projectBuilder().id,
			title: 'Agent note'
		});
		expect({ revision: note.publishedRevision, publishedAt: note.publishedAt }).toEqual({
			revision: 0,
			publishedAt: undefined
		});
	});
});
