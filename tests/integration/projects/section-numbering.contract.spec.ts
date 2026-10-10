import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { createProjectServices } from '$lib/server/factories/capabilities/projects-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { ProjectDetailService } from '$lib/services/projects/details';
import { ProjectTreePresentationService } from '$lib/services/projects/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it } from 'vitest';
import { actor, context, seedUser } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = await seedUser(suffix);
	const repository = new ProjectRecords(context.db);
	const project = await repository.insert(owner, { name: 'Numbering contract' });
	const controller = new Projects(
		new WorkspaceCommandRulesService(),
		capabilityDependencies<ProjectsDependencies>({
			...agentToolResultsFixture(),
			noteCreationRules: new NoteLifecycleRulesService(),
			details: new ProjectDetailService(),
			presentation: new ProjectTreePresentationService(),
			projectEditor: createProjectServices(repository, repository).editor
		})
	);
	return { owner, repository, project, controller };
};
it.each([true, false])('persists an explicit %s project numbering default', async (enabled) => {
	const { owner, repository, project, controller } = await setup(enabled ? '23501' : '23502');
	await controller.setSectionNumberingDefault(owner, { projectId: project.id, enabled });
	expect((await repository.findById(owner, project.id))?.sectionNumberingDefault).toBe(enabled);
});
it('clears the stored project override to inherit the app setting', async () => {
	const { owner, repository, project, controller } = await setup('23503');
	await controller.setSectionNumberingDefault(owner, { projectId: project.id, enabled: false });
	await controller.setSectionNumberingDefault(owner, { projectId: project.id });
	expect((await repository.findById(owner, project.id))?.sectionNumberingDefault).toBeUndefined();
});
it('refuses an archived project default', async () => {
	const { owner, repository, project, controller } = await setup('23504');
	await repository.archive(owner, project.id);
	await expect(
		controller.setSectionNumberingDefault(owner, { projectId: project.id, enabled: true })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
it('refuses another actor project default', async () => {
	const { project, controller } = await setup('23505');
	await expect(
		controller.setSectionNumberingDefault(actor('23506'), { projectId: project.id, enabled: true })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
