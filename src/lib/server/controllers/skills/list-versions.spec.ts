import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { NoteCatalog } from '$lib/server/services/notes/catalog';
import {
	InMemoryNoteRepository,
	InMemoryAnchorRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteRevisionId } from '$lib/models/notes';

const setup = async () => {
	const notes = new InMemoryNoteRepository();
	const note = noteBuilder({ kind: 'skill', currentRevision: 3, publishedRevision: 2 });
	notes.notes = [note];
	notes.revisions = [1, 2].map((revision) => ({
		id: crypto.randomUUID() as NoteRevisionId,
		noteId: note.id,
		revision,
		title: `Instructions ${revision}`,
		document: { type: 'doc', content: [] },
		plainText: '',
		createdAt: testNow
	}));
	const library = new SkillLibrary(
		new InMemorySkillRepository(notes),
		notes,
		new InMemoryProvenanceRepository()
	);
	await library.create(testActor(), note, {
		name: 'Review',
		description: 'Review changes',
		triggerHints: []
	});
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const catalog = new NoteCatalog(notes, new InMemoryAnchorRepository(), projects);
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({ skillFinder: library, revisionReader: catalog })
	);
	return { controller, notes, note };
};
it('lists the newest immutable skill revision first', async () => {
	const { controller, note } = await setup();
	expect(
		(await controller.listVersions(testActor(), { noteId: note.id })).map((item) => item.revision)
	).toEqual([2, 1]);
});
it('does not offer revisions of an archived skill', async () => {
	const { controller, notes, note } = await setup();
	notes.notes = [{ ...note, archivedAt: testNow }];
	await expect(controller.listVersions(testActor(), { noteId: note.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
});
it('returns no history for a skill with no immutable snapshots', async () => {
	const { controller, notes, note } = await setup();
	notes.notes = [{ ...note, publishedRevision: 0 }];
	notes.revisions = [];
	expect(await controller.listVersions(testActor(), { noteId: note.id })).toEqual([]);
});
