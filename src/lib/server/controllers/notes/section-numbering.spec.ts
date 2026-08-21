import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from './controller';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryUserPreferencesRepository } from '$lib/testing/identity/fakes/in-memory-user-preferences';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const content = new InMemoryNoteContent();
	const projects = new InMemoryProjects();
	const preferences = new InMemoryUserPreferencesRepository();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			noteReader: content,
			noteSectionNumbering: content,
			projectReader: projects,
			userPreferences: preferences
		})
	);
	return { content, projects, preferences, controller };
};

const seed = (content: InMemoryNoteContent, projects: InMemoryProjects) => {
	projects.projects = [projectBuilder()];
	const note = noteBuilder();
	content.notes = [note];
	return note;
};

describe('Setting section numbering on a note', () => {
	it('pins an explicit choice on the note', async () => {
		const { content, projects, controller } = setup();
		const note = seed(content, projects);
		const output = await controller.setSectionNumbering(testActor(), {
			noteId: note.id,
			enabled: true
		});
		expect(output.sectionNumbering.effective).toBe(true);
	});

	it('persists the override on the note itself', async () => {
		const { content, projects, controller } = setup();
		const note = seed(content, projects);
		await controller.setSectionNumbering(testActor(), { noteId: note.id, enabled: false });
		expect(content.notes[0]?.sectionNumbering).toBe(false);
	});

	it('hands the note back to the project default when the override clears', async () => {
		const { content, projects, controller } = setup();
		const note = seed(content, projects);
		projects.projects = [{ ...projects.projects[0]!, sectionNumberingDefault: true }];
		await controller.setSectionNumbering(testActor(), { noteId: note.id, enabled: false });
		const output = await controller.setSectionNumbering(testActor(), { noteId: note.id });
		expect(output.sectionNumbering.effective).toBe(true);
	});

	it('reports what an inheriting note falls back to', async () => {
		const { content, projects, preferences, controller } = setup();
		const note = seed(content, projects);
		await preferences.update(testActor(), { sectionNumberingDefault: true });
		const output = await controller.setSectionNumbering(testActor(), { noteId: note.id });
		expect(output.sectionNumbering.inherited).toBe(true);
	});
});
