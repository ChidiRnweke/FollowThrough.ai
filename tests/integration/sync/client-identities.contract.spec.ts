import { describe, expect, it } from 'vitest';
import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, seedNote } from '../database-harness';

describe('stable offline creation identities', () => {
	it('keeps the caller-assigned project identity', async () => {
		const id = crypto.randomUUID() as ProjectId;
		const project = await new ProjectRecords(context.db).insert(actor('9001'), {
			id,
			name: 'Offline project'
		});
		expect(project.id).toBe(id);
	});

	it('keeps the caller-assigned folder identity so child references remain valid', async () => {
		const { owner, project } = await seedNote('9002');
		const id = crypto.randomUUID() as NoteId;
		const folder = await new ProjectRecords(context.db).insertFolder(
			owner,
			{ id, projectId: project.id, name: 'Offline folder' },
			1
		);
		expect(folder.id).toBe(id);
	});
});
