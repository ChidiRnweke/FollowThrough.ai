import { expect, it } from 'vitest';
import { BuiltInSkills } from './built-ins';
import { BUILT_INS, RETIRED_BUILT_INS } from './built-in-definitions';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	const notes = new InMemoryNoteRepository();
	const skills = new InMemorySkillRepository(notes);
	const provisioner = new BuiltInSkills(projects, notes, skills, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	return { projects, notes, provisioner };
};

it('replaces an archived Inbox while preserving built-in identities', async () => {
	const { projects, notes, provisioner } = setup();
	const owner = testActor();
	await provisioner.ensure(owner);
	const previous = (await projects.findInbox(owner))!;
	const ids = notes.notes.map((note) => note.id).sort();
	await projects.archive(owner, previous.id);
	await provisioner.ensure(owner);
	const active = (await projects.findInbox(owner))!;
	expect({
		replaced: active.id !== previous.id,
		previousArchived: Boolean(
			projects.projects.find((project) => project.id === previous.id)?.archivedAt
		),
		ids: notes.notes.map((note) => note.id).sort(),
		placed: notes.notes.every((note) => note.projectId === active.id)
	}).toEqual({ replaced: true, previousArchived: true, ids, placed: true });
});

it('uses an available Inbox name without claiming another project', async () => {
	const { projects, provisioner } = setup();
	const owner = testActor();
	await projects.insert(owner, { name: 'inbox', role: 'workspace' });
	await projects.insert(owner, { name: 'Inbox (2)', role: 'workspace' });
	await provisioner.ensure(owner);
	expect(projects.projects.map((project) => ({ name: project.name, role: project.role }))).toEqual([
		{ name: 'inbox', role: 'workspace' },
		{ name: 'Inbox (2)', role: 'workspace' },
		{ name: 'Inbox (3)', role: 'inbox' }
	]);
});
