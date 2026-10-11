import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { createSkillServices } from '$lib/server/factories/capabilities/skills-capability-factory';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

export const builtInSkillsFixture = () => {
	const notes = new InMemoryNoteRepository(testActor());
	const projects = new InMemoryProjectRepository(testActor(), notes);
	const skills = new InMemorySkillRepository(notes);
	const builtInSkills = new BuiltInSkills(testActor(), projects, notes, skills, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	const transactionRunner = new InMemoryTransactionRunner([projects, notes, skills]);
	const skillFinder = createSkillServices(
		testActor(),
		skills,
		notes,
		new InMemoryProvenanceRepository(testActor())
	).finder;
	return { notes, projects, skills, builtInSkills, transactionRunner, skillFinder };
};
