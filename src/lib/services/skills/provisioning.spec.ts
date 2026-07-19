import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECT_NAME } from '$lib/models';
import { InMemoryProjectRepository } from '$lib/testing/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import { noteBuilder, projectBuilder, testActor } from '$lib/testing/fixtures/domain-builders';
import { DefaultBuiltInSkillProvisioner } from './provisioning';

const legacyInstructions = `Use FollowThrough as an action-oriented workbench.

Discover the available action tools before answering. Prefer read tools to inspect current state, proposal tools for AI-generated suggestions, and mutation tools only when the requested execution mode permits them. Load other skills lazily when their summaries or trigger hints match the request. Keep AI-generated proposals reviewable and preserve provenance.`;

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

const setupLegacyFollowThrough = async () => {
	const state = setup();
	await state.provisioner.ensure(testActor());
	const current = state.skills.skills.find((skill) => skill.note.builtInKey === 'followthrough')!;
	const note = {
		...current.note,
		document: {
			type: 'doc' as const,
			content: [{ type: 'paragraph', content: [{ type: 'text', text: legacyInstructions }] }]
		},
		plainText: legacyInstructions,
		currentRevision: 1,
		publishedRevision: 0,
		publishedAt: undefined
	};
	state.notes.notes = state.notes.notes.map((candidate) =>
		candidate.id === note.id ? note : candidate
	);
	state.skills.skills = state.skills.skills.map((skill) =>
		skill.note.id === note.id
			? {
					...skill,
					note,
					name: 'FollowThrough',
					slug: 'followthrough',
					description: 'Discover and use FollowThrough actions safely.',
					triggerHints: ['create', 'update', 'organize', 'plan', 'follow through'],
					metadata: {
						'followthrough.built-in': 'true',
						'followthrough.built-in-key': 'followthrough'
					},
					allowImplicitInvocation: true
				}
			: skill
	);
	return state;
};

describe('Built-in skill provisioning invariants', () => {
	it('creates each visible built-in skill exactly once per user', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		await provisioner.ensure(testActor());
		expect(skills.skills.map((skill) => skill.name)).toEqual(['FollowThrough', 'Diagramming']);
	});

	it('provisions the current FollowThrough guide version for new users', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		const followThrough = skills.skills.find((skill) => skill.note.builtInKey === 'followthrough');
		expect(followThrough?.metadata?.['followthrough.built-in-version']).toBe('2');
	});

	it('provisions detailed product guidance for new users', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		const followThrough = skills.skills.find((skill) => skill.note.builtInKey === 'followthrough');
		expect(followThrough?.note.plainText).toContain('## Product model');
	});

	it('upgrades an untouched stock FollowThrough skill in place', async () => {
		const { provisioner, skills } = await setupLegacyFollowThrough();
		await provisioner.ensure(testActor());
		const followThrough = skills.skills.find((skill) => skill.note.builtInKey === 'followthrough');
		expect({
			version: followThrough?.metadata?.['followthrough.built-in-version'],
			revision: followThrough?.note.currentRevision
		}).toEqual({ version: '2', revision: 2 });
	});

	it('records one immutable revision for a stock guide upgrade', async () => {
		const { provisioner, notes } = await setupLegacyFollowThrough();
		await provisioner.ensure(testActor());
		const followThrough = notes.notes.find((note) => note.builtInKey === 'followthrough')!;
		expect(notes.revisions.filter((revision) => revision.noteId === followThrough.id)).toHaveLength(
			2
		);
	});

	it('does not repeat an already-applied stock guide upgrade', async () => {
		const { provisioner, notes } = await setupLegacyFollowThrough();
		await provisioner.ensure(testActor());
		await provisioner.ensure(testActor());
		const followThrough = notes.notes.find((note) => note.builtInKey === 'followthrough')!;
		expect(notes.revisions.filter((revision) => revision.noteId === followThrough.id)).toHaveLength(
			2
		);
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
		expect(notes.notes.map((note) => note.title)).toEqual([
			'My workbench instructions',
			'Diagramming'
		]);
	});

	it('does not overwrite edited stock FollowThrough instructions', async () => {
		const { provisioner, notes, skills } = await setupLegacyFollowThrough();
		const current = notes.notes.find((note) => note.builtInKey === 'followthrough')!;
		const edited = { ...current, plainText: 'My preferred workflow', currentRevision: 2 };
		notes.notes = notes.notes.map((note) => (note.id === edited.id ? edited : note));
		skills.skills = skills.skills.map((skill) =>
			skill.note.id === edited.id ? { ...skill, note: edited } : skill
		);
		await provisioner.ensure(testActor());
		expect(notes.notes.find((note) => note.id === edited.id)?.plainText).toBe(
			'My preferred workflow'
		);
	});

	it('adopts a legacy FollowThrough note without replacing its content', async () => {
		const { provisioner, notes } = setup();
		notes.notes = [
			noteBuilder({
				kind: 'skill',
				title: 'FollowThrough',
				plainText: 'My legacy app instructions'
			})
		];
		await provisioner.ensure(testActor());
		expect(notes.notes.find((note) => note.title === 'FollowThrough')?.plainText).toBe(
			'My legacy app instructions'
		);
	});

	it('preserves the disabled state while upgrading untouched stock guidance', async () => {
		const { provisioner, skills } = await setupLegacyFollowThrough();
		skills.skills = skills.skills.map((skill) =>
			skill.note.builtInKey === 'followthrough' ? { ...skill, isEnabled: false } : skill
		);
		await provisioner.ensure(testActor());
		const followThrough = skills.skills.find((skill) => skill.note.builtInKey === 'followthrough');
		expect(followThrough?.isEnabled).toBe(false);
	});

	it('records the initial skill revision', async () => {
		const { provisioner, notes } = setup();
		await provisioner.ensure(testActor());
		expect(notes.revisions.map((revision) => revision.revision)).toEqual([1, 1]);
	});

	it('fails with guidance when the Diagramming skill is disabled', async () => {
		const { provisioner, skills } = setup();
		await provisioner.ensure(testActor());
		const diagramming = skills.skills.find((skill) => skill.note.builtInKey === 'diagramming')!;
		skills.skills = skills.skills.map((skill) =>
			skill.note.id === diagramming.note.id ? { ...skill, isEnabled: false } : skill
		);
		await expect(provisioner.load(testActor(), 'diagramming')).rejects.toThrow('Re-enable it');
	});
});
