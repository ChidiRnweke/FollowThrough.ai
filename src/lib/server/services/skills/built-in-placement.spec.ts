import { expect, it } from 'vitest';
import { BuiltInSkills } from './built-ins';
import { BUILT_INS, RETIRED_BUILT_INS } from './built-in-definitions';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	noteBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async () => {
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder({ role: 'inbox' })];
	const notes = new InMemoryNoteRepository();
	const skills = new InMemorySkillRepository(notes);
	const provisioner = new BuiltInSkills(projects, notes, skills, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	await provisioner.ensure(testActor());
	const folder = noteBuilder({ id: testNoteId(90), kind: 'folder' });
	notes.notes.push(folder);
	const builtIn = notes.notes.find((note) => note.builtInKey === 'followthrough')!;
	notes.notes = notes.notes.map((note) =>
		note.id === builtIn.id ? { ...note, parentId: folder.id } : note
	);
	return { projects, notes, provisioner, folder, builtIn };
};

it('moves a built-in out of an archived project without retaining its old folder', async () => {
	const { projects, notes, provisioner, builtIn } = await setup();
	await projects.archive(testActor(), builtIn.projectId);
	await provisioner.ensure(testActor());
	const repaired = await notes.findByBuiltInKey(testActor(), 'followthrough');
	const inbox = await projects.findInbox(testActor());
	expect({ projectId: repaired?.projectId, parentId: repaired?.parentId }).toEqual({
		projectId: inbox?.id,
		parentId: undefined
	});
});

it('restores a built-in at the root when its previous parent was archived', async () => {
	const { notes, provisioner, folder, builtIn } = await setup();
	notes.notes = notes.notes.map((note) =>
		note.id === folder.id || note.id === builtIn.id ? { ...note, archivedAt: testNow } : note
	);
	await provisioner.ensure(testActor());
	const repaired = await notes.findByBuiltInKey(testActor(), 'followthrough');
	expect({ parentId: repaired?.parentId, archivedAt: repaired?.archivedAt }).toEqual({
		parentId: undefined,
		archivedAt: undefined
	});
});
