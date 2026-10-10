import { SkillPortabilityService, type SkillPortability } from '$lib/services/skills/manifest';
import {
	SkillMetadataEditingService,
	type SkillMetadataEditing
} from '$lib/services/skills/metadata';
import type { Database } from '$lib/server/db';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import {
	BuiltInSkills,
	type BuiltInSkillProvisioner,
	type BuiltInSkillSelection
} from '$lib/server/services/skills/built-ins';
import {
	SkillCreationService,
	SkillReadingService,
	SkillEditingService,
	SkillUsageService,
	type SkillCreator,
	type SkillFinder,
	type SkillEditor,
	type SkillUsageRecorder,
	type SkillUsageLister
} from '$lib/server/services/skills/library';
import type { SkillRepository } from '$lib/server/repositories/skills/skills';
import { SkillPins, type SkillPinWriter } from '$lib/server/services/skills/pins';

export interface SkillsCapabilityInput {
	readonly db: Database;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly provenance: ProvenanceRepository;
}

export interface SkillsCapability {
	readonly portability: SkillPortability;
	readonly metadataEditing: SkillMetadataEditing;
	readonly services: SkillServices;
	readonly builtIns: BuiltInSkillProvisioner & BuiltInSkillSelection;
	readonly pins: SkillPinWriter;
}

export const createSkillsCapability = (input: SkillsCapabilityInput): SkillsCapability => {
	const repository = new SkillRecords(input.db);
	const services = createSkillServices(repository, input.notes, input.provenance);
	const builtIns = new BuiltInSkills(input.projects, input.notes, repository, {
		active: BUILT_INS,
		retired: RETIRED_BUILT_INS
	});
	return {
		portability: new SkillPortabilityService(),
		metadataEditing: new SkillMetadataEditingService(),
		services,
		builtIns,
		pins: new SkillPins(input.projects, input.notes, repository)
	};
};

export interface SkillServices {
	readonly creator: SkillCreator;
	readonly finder: SkillFinder;
	readonly editor: SkillEditor;
	readonly usageRecorder: SkillUsageRecorder;
	readonly usageLister: SkillUsageLister;
}
export function createSkillServices(
	skills: SkillRepository,
	notes: NoteRepository,
	provenance: ProvenanceRepository
): SkillServices {
	const usage = new SkillUsageService(skills, notes, provenance);
	return {
		creator: new SkillCreationService(skills, notes),
		finder: new SkillReadingService(skills),
		editor: new SkillEditingService(skills, notes),
		usageRecorder: usage,
		usageLister: usage
	};
}
