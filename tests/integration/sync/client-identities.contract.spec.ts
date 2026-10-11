import { noteCreationControllers } from '$lib/testing/notes/fixtures/creation';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { describe, expect, it } from 'vitest';
import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { seedUser, context, seedNote } from '../database-harness';

describe('stable offline creation identities', () => {
	it('keeps the caller-assigned project identity', async () => {
		const id = crypto.randomUUID() as ProjectId;
		const project = await new ProjectRecords(await seedUser('9001'), context.db).insert({
			id,
			name: 'Offline project'
		});
		expect(project.id).toBe(id);
	});

	it('keeps the caller-assigned folder identity so child references remain valid', async () => {
		const { owner, project } = await seedNote('9002');
		const id = crypto.randomUUID() as NoteId;
		const { database, transactionRunner } = createTransactionContext(context.db);
		const { services: catalog } = createNotesCapability(owner, {
			db: database,
			projects: new ProjectRecords(owner, database)
		});
		const { folder } = await noteCreationControllers(
			catalog.creator,
			transactionRunner
		).projects.createFolder({
			id,
			projectId: project.id,
			name: 'Offline folder'
		});
		expect(folder.id).toBe(id);
	});
});
