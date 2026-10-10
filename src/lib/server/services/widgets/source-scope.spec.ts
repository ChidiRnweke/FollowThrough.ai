import { expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '$lib/errors';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryWidgetRepository } from '$lib/testing/widgets/fakes/in-memory-widget-repository';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WidgetLibrary } from './library';

const setup = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const widgets = new InMemoryWidgetRepository();
	return { notes, widgets, library: new WidgetLibrary(widgets, projects, notes) };
};
it('keeps a widget source in its own project', async () => {
	const { notes, library } = setup();
	notes.notes = [noteBuilder()];
	expect(await library.create(testActor(), widgetBuilder())).toEqual(widgetBuilder());
});
it('rejects a missing widget source', async () => {
	const { library } = setup();
	await expect(library.create(testActor(), widgetBuilder())).rejects.toBeInstanceOf(NotFoundError);
});
it('rejects a source owned by another account', async () => {
	const { notes, library } = setup();
	notes.notes = [noteBuilder({ userId: testActor(2).userId })];
	await expect(library.create(testActor(), widgetBuilder())).rejects.toBeInstanceOf(NotFoundError);
});
it('rejects a source in another owned project', async () => {
	const { notes, library } = setup();
	notes.notes = [noteBuilder({ projectId: testProjectId(2) })];
	await expect(library.create(testActor(), widgetBuilder())).rejects.toBeInstanceOf(
		ValidationError
	);
});
it('allows a widget without a source note', async () => {
	const { library } = setup();
	const widget = widgetBuilder({ sourceNoteId: undefined });
	expect(await library.create(testActor(), widget)).toEqual(widget);
});
