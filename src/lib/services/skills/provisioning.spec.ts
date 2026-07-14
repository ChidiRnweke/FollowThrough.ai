import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_NAME } from '$lib/models';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import { projectBuilder, testActor } from '$lib/testing/fixtures/domain-builders';
import { DefaultBuiltInSkillProvisioner } from './provisioning';

const setup = () => {
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder({ name: DEFAULT_PROJECT_NAME })];
	const notes = new InMemoryNoteRepository();
	const skills = new InMemorySkillRepository();
	return {
		notes,
		skills,
		provisioner: new DefaultBuiltInSkillProvisioner(projects, notes, skills)
	};
};

describe('Built-in skill provisioning invariants', () => {
	it('creates exactly one visible FollowThrough skill per user', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		await provisioner.ensure(testActor());
		expect(skills.skills.map((skill) => skill.name)).toEqual(['FollowThrough']);
	});

	it('does not recreate a user-renamed FollowThrough skill', async () => {
		const { provisioner, notes } = setup();
		await provisioner.ensure(testActor());
		const existing = notes.notes[0]!;
		notes.notes[0] = {
			...existing,
			title: 'My workbench instructions',
			plainText: 'My customized instructions'
		};
		await provisioner.ensure(testActor());
		expect(notes.notes.map((note) => note.title)).toEqual(['My workbench instructions']);
	});

	it('records the initial skill revision', async () => {
		const { provisioner, notes } = setup();
		await provisioner.ensure(testActor());
		expect(notes.revisions.map((revision) => revision.revision)).toEqual([1]);
	});
});
