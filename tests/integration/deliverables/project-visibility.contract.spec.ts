import { expect, it } from 'vitest';
import { NotFoundError } from '$lib/errors';
import { ArtifactRecords } from '$lib/server/repositories/deliverables/postgres/artifacts';
import { ExportSettingsRecords } from '$lib/server/repositories/deliverables/postgres/export-settings';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { context, seedNote, seedArtifact } from '../database-harness';

it('hides archived project artifacts from direct download lookups', async () => {
	const { owner, project } = await seedNote('32721');
	const artifact = await seedArtifact(owner, project.id, '32721');
	await new ProjectRecords(owner, context.db).archive(project.id);
	expect(await new ArtifactRecords(owner, context.db).findById(artifact.id)).toBeUndefined();
});
it('excludes archived project artifacts from both totals and pages', async () => {
	const { owner, project } = await seedNote('32722');
	await seedArtifact(owner, project.id, '32722');
	await new ProjectRecords(owner, context.db).archive(project.id);
	const result = await new ArtifactRecords(owner, context.db).listByProject(project.id);
	expect(result).toMatchObject({ total: 0, artifacts: [] });
});
it('rejects an archived project instead of reporting absent export settings', async () => {
	const { owner, project } = await seedNote('32723');
	await new ProjectRecords(owner, context.db).archive(project.id);
	await expect(
		new ExportSettingsRecords(owner, context.db).find(project.id)
	).rejects.toBeInstanceOf(NotFoundError);
});
it('allows settings defaults for an accessible project without stored settings', async () => {
	const { owner, project } = await seedNote('32724');
	expect(await new ExportSettingsRecords(owner, context.db).find(project.id)).toBeUndefined();
});
