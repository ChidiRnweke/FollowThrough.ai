import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { NotFoundError } from '$lib/errors';
import type { DiagramId } from '$lib/models/diagrams';
import { diagrams } from '$lib/server/db/schema/diagrams';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner, project, note } = await seedNote(suffix);
	const records = new DiagramRecords(context.db);
	const diagram = drawioBuilder({
		id: crypto.randomUUID() as DiagramId,
		userId: owner.userId,
		projectId: project.id,
		sourceNoteId: note.id
	});
	await records.insert(owner, diagram);
	await new ProjectRecords(context.db).archive(owner, project.id);
	return { owner, project, records, diagram };
};
it('hides direct diagrams when their project is archived', async () => {
	const { owner, records, diagram } = await setup('32711');
	expect(await records.findById(owner, diagram.id)).toBeUndefined();
});
it('refuses locking reads in archived projects', async () => {
	const { owner, records, diagram } = await setup('32712');
	expect(await records.findForWrite(owner, diagram.id)).toBeUndefined();
});
it('excludes archived projects from diagram counts', async () => {
	const { owner, project, records } = await setup('32713');
	expect(await records.countForProject(owner, project.id)).toBe(0);
});
it('does not expose revision history from archived projects', async () => {
	const { owner, records, diagram } = await setup('32714');
	await expect(records.listRevisions(owner, diagram.id)).rejects.toBeInstanceOf(NotFoundError);
});
it('keeps diagram lifecycle unchanged by project archival', async () => {
	const { diagram } = await setup('32715');
	const [stored] = await context.db.select().from(diagrams).where(eq(diagrams.id, diagram.id));
	expect(stored?.archivedAt).toBeNull();
});
