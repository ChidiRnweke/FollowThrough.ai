import { expect, it } from 'vitest';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProjectCatalog } from '$lib/server/services/projects/catalog';
import { Projects, type ProjectsDependencies } from '$lib/server/controllers/projects/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { seedUser, actor, context } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = await seedUser(suffix);
	const repository = new ProjectRecords(context.db);
	const project = await repository.insert(owner, { name: 'Numbering contract' });
	const controller = new Projects(
		capabilityDependencies<ProjectsDependencies>({
			projectEditor: new ProjectCatalog(repository, repository)
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
