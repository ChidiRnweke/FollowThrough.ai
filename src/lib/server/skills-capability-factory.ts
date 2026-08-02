import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { BuiltInSkillLibrary, BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { SkillManifestCodec } from '$lib/server/services/skills/manifest';

export interface SkillsCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly provenance: ProvenanceRepository;
}

export interface SkillsCapability {
	readonly library: SkillLibrary;
	readonly builtIns: BuiltInSkills;
	readonly provisioned: BuiltInSkillLibrary;
}

export const createSkillsCapability = (input: SkillsCapabilityInput): SkillsCapability => {
	const repository = new SkillRecords(input.db);
	const library = new SkillLibrary(
		repository,
		input.notes,
		input.provenance,
		new SkillManifestCodec()
	);
	const builtIns = new BuiltInSkills(input.projects, input.notes, repository, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	return { library, builtIns, provisioned: new BuiltInSkillLibrary(builtIns, library) };
};
