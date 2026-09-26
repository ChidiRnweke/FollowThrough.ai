import { expect, it } from 'vitest';
import { Skills, type SkillsDependencies } from './controller';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { SkillEditInput } from '$lib/models/skills';

const setup = async () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(notes);
	const skills = new InMemorySkillRepository(notes);
	const library = new SkillLibrary(skills, notes, new InMemoryProvenanceRepository());
	const transactionRunner = new InMemoryTransactionRunner([projects, notes, skills]);
	const released = RETIRED_BUILT_INS.find((definition) => definition.key === 'followthrough');
	if (!released) throw new Error('The released guide fixture is required');
	await transactionRunner.run(() =>
		new BuiltInSkills(projects, notes, skills, { active: [released], retired: [] }).ensure(
			testActor()
		)
	);
	const note = await notes.findByBuiltInKey(testActor(), released.key);
	if (!note) throw new Error('The installed guide is required');
	const controller = new Skills(
		capabilityDependencies<SkillsDependencies>({
			transactionRunner,
			skillEditor: library,
			skillFinder: library,
			skillUsageLister: library,
			builtInSkills: new BuiltInSkills(projects, notes, skills, {
				active: BUILT_INS,
				retired: RETIRED_BUILT_INS
			})
		})
	);
	return { controller, library, notes, note, released };
};
const metadataEdits: {
	name: string;
	input: Pick<SkillEditInput, 'description' | 'triggerHints'>;
}[] = [
	{ name: 'description', input: { description: 'My team workflow' } },
	{ name: 'trigger hints', input: { triggerHints: ['my workflow'] } }
];
it.each(metadataEdits)(
	'preserves a released guide after the user changes its $name',
	async ({ input }) => {
		const { controller, library, note, released } = await setup();
		const edited = await controller.update(testActor(), { noteId: note.id, ...input });
		await controller.list(testActor());
		const retained = await library.getForEdit(testActor(), note.id);
		expect({
			text: retained.note.plainText,
			revision: retained.note.currentRevision,
			description: retained.description,
			hints: retained.triggerHints
		}).toEqual({
			text: released.instructions,
			revision: 1,
			description: edited.skill.description,
			hints: edited.skill.triggerHints
		});
	}
);
it('upgrades stock content without re-enabling a guide disabled through the controller', async () => {
	const { controller, library, note } = await setup();
	await controller.update(testActor(), { noteId: note.id, isEnabled: false });
	await controller.list(testActor());
	const retained = await library.getForEdit(testActor(), note.id);
	expect({
		text: retained.note.plainText,
		revision: retained.note.currentRevision,
		enabled: retained.isEnabled
	}).toEqual({
		text: BUILT_INS.find((definition) => definition.key === 'followthrough')?.instructions,
		revision: 2,
		enabled: false
	});
});
