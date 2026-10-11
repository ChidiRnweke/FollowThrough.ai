import type { ActorContext } from '$lib/models/identity';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectRules } from '$lib/services/projects/rules';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { actor, context, seedUser } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = await seedUser(suffix);
	const repository = new ProjectRecords(owner, context.db);
	const project = await repository.insert({ name: 'Numbering contract' });
	const controllerFor = (actor: ActorContext) => {
		const projects = new ProjectRecords(actor, context.db);
		return new Projects(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<ProjectsDependencies>({
				...agentToolResultsFixture(),
				noteCreationRules: new NoteLifecycleRulesService(),
				details: new ProjectRules(),
				presentation: new ProjectTreePresentationService(),
				projects: createProjectServices(actor, projects, projects).catalog
			})
		);
	};
	return { owner, repository, project, controller: controllerFor(owner), controllerFor };
};
it.each([true, false])('persists an explicit %s project numbering default', async (enabled) => {
	const { repository, project, controller } = await setup(enabled ? '23501' : '23502');
	await controller.setSectionNumberingDefault({ projectId: project.id, enabled });
	expect((await repository.findById(project.id))?.sectionNumberingDefault).toBe(enabled);
});
it('clears the stored project override to inherit the app setting', async () => {
	const { repository, project, controller } = await setup('23503');
	await controller.setSectionNumberingDefault({ projectId: project.id, enabled: false });
	await controller.setSectionNumberingDefault({ projectId: project.id });
	expect((await repository.findById(project.id))?.sectionNumberingDefault).toBeUndefined();
});
it('refuses an archived project default', async () => {
	const { repository, project, controller } = await setup('23504');
	await repository.archive(project.id);
	await expect(
		controller.setSectionNumberingDefault({ projectId: project.id, enabled: true })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('refuses another actor project default', async () => {
	const { project, controllerFor } = await setup('23505');
	await expect(
		controllerFor(actor('23506')).setSectionNumberingDefault({
			projectId: project.id,
			enabled: true
		})
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
