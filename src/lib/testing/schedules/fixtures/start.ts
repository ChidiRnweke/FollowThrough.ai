import type { AgentModel } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import type { Note } from '$lib/models/notes';
import type { Skill } from '$lib/models/skills';
import type { SchedulesDependencies } from '$lib/server/controllers/schedules/controller';
import {
	AgentModelChoiceService,
	AgentModelSelectionService
} from '$lib/services/agent/model-selection';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryModelCatalog } from '$lib/testing/agent/fakes/in-memory-model-catalog';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

/** A model the provider offers for chat, as its catalog lists one. */
export const offeredModel = (id: string): AgentModel => ({
	id,
	name: id,
	provider: 'test',
	supportsTools: true,
	supportsVision: false,
	recommended: false,
	capabilities: ['tools']
});

/** A model a schedule can name: the provider offers it, and it is not the deployment default. */
export const scheduleModel = 'anthropic/careful-model';

/** The project a schedule in these specs names. */
export const scheduleProject = projectBuilder({ id: testProjectId(7), name: 'Docs relaunch' });

/** A skill its owner turned on, so a schedule can name it. */
export const scheduleSkill = (noteId = testNoteId(41), title = 'Daily planning'): Skill<Note> => ({
	note: noteBuilder({
		id: noteId,
		kind: 'skill',
		title,
		plainText: 'Plan the day in three steps.'
	}),
	description: 'Plan a day from the open todos',
	slug: title.toLowerCase().replaceAll(' ', '-'),
	metadata: {},
	allowImplicitInvocation: false,
	triggerHints: [],
	isEnabled: true
});

/**
 * What a schedule's project, model and skills are checked against, for one user: a catalog that
 * offers `scheduleModel`, the project `scheduleProject` and the skill `scheduleSkill()`.
 */
export const scheduleStartFixture = (actor: ActorContext) => {
	const models = new InMemoryModelCatalog();
	models.models = [offeredModel(scheduleModel)];
	const projects = new InMemoryProjects(actor);
	projects.projects = [{ ...scheduleProject, userId: actor.userId }];
	const skills = new InMemorySkills();
	skills.skills = [scheduleSkill()];
	const dependencies: Pick<
		SchedulesDependencies,
		| 'models'
		| 'modelChoices'
		| 'modelSelection'
		| 'defaultModel'
		| 'defaultVisionModel'
		| 'projects'
		| 'skills'
	> = {
		models,
		modelChoices: new AgentModelChoiceService(),
		modelSelection: new AgentModelSelectionService(),
		defaultModel: 'openai/test-model',
		defaultVisionModel: 'openai/test-vision-model',
		projects,
		skills
	};
	return { models, projects, skills, dependencies };
};
