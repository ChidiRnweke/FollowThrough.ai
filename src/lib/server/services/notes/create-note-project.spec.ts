import { describe, expect, it } from 'vitest';
import { NoteCatalog } from './catalog';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import {
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	return {
		projects,
		catalog: new NoteCatalog(new InMemoryNoteRepository(), new InMemoryAnchorRepository(), projects)
	};
};

describe('The project a note is created in', () => {
	it('uses the project it was told to use', async () => {
		const { catalog, projects } = setup();
		projects.projects = [projectBuilder({ id: testProjectId() })];
		const note = await catalog.create(testActor(), {
			title: 'Ingest design',
			projectId: testProjectId()
		});
		expect(note.projectId).toBe(testProjectId());
	});

	// It used to answer a project it could not find by taking the first active one,
	// and failing that by creating one called "General" — so a note could be filed
	// somewhere nobody chose, and saving a note could bring a project into being.
	it('refuses a project that is not there rather than choosing another', async () => {
		const { catalog, projects } = setup();
		projects.projects = [projectBuilder({ id: testProjectId() })];
		await expect(
			catalog.create(testActor(), {
				title: 'Ingest design',
				projectId: '9f1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d' as ReturnType<typeof testProjectId>
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('never creates a project as a side effect of creating a note', async () => {
		const { catalog, projects } = setup();
		projects.projects = [projectBuilder({ id: testProjectId() })];
		await catalog.create(testActor(), { title: 'Ingest design', projectId: testProjectId() });
		expect(projects.projects).toHaveLength(1);
	});
});
