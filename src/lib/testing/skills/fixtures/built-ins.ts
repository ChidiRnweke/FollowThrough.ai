import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemorySkillRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';

export const builtInSkillsFixture = () => {
	const notes = new InMemoryNoteRepository();
	const projects = new InMemoryProjectRepository(notes);
	const skills = new InMemorySkillRepository(notes);
	const builtInSkills = new BuiltInSkills(projects, notes, skills, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	const transactionRunner = new InMemoryTransactionRunner([projects, notes, skills]);
	const skillFinder = new SkillLibrary(skills, notes, new InMemoryProvenanceRepository());
	return { notes, projects, skills, builtInSkills, transactionRunner, skillFinder };
};
