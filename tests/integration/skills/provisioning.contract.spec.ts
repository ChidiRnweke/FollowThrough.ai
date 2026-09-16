import { afterAll, expect, it } from 'vitest';
import { syncCursorSchema } from '$lib/models/sync';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSkillsCapability } from '$lib/server/factories/capabilities/skills-capability-factory';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import {
	Workspace,
	type WorkspaceDependencies
} from '$lib/server/controllers/workspace/controller';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { WorkspaceSyncChanges } from '$lib/server/repositories/workspace/sync-changes';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context } from '../database-harness';

const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});

const setup = () => {
	const client = postgres(context.url, { max: 3 });
	clients.push(client);
	const { database, transactionRunner } = createTransactionContext(drizzle(client, { schema }));
	const projects = new ProjectRecords(database);
	const notes = new NoteRecords(database);
	const capability = createSkillsCapability({
		db: database,
		projects,
		notes,
		provenance: new ProvenanceRecords(database)
	});
	const dependencies = {
		transactionRunner,
		builtInSkills: capability.builtIns,
		skillFinder: capability.library
	};
	return {
		projects,
		notes,
		skills: new Skills(capabilityDependencies<SkillsDependencies>(dependencies)),
		workspace: new Workspace(
			capabilityDependencies<WorkspaceDependencies>({
				...dependencies,
				syncChanges: new WorkspaceSyncChanges(database)
			})
		)
	};
};

it('returns one complete built-in installation to simultaneous first requests', async () => {
	const state = setup();
	const owner = actor('811');
	const results = await Promise.all([
		state.skills.list(owner),
		state.skills.list(owner),
		state.skills.list(owner)
	]);
	const notes = await state.notes.listActive(owner);
	const revisions = await Promise.all(
		notes.map((note) => state.notes.listRevisions(owner, note.id))
	);
	expect({
		catalogs: results.map((result) => result.skills.map((skill) => skill.name)),
		projects: (await state.projects.listActive(owner)).map((project) => project.role),
		notes: notes.length,
		revisions: revisions.map((history) => history.length)
	}).toEqual({
		catalogs: Array.from({ length: 3 }, () => ['Diagramming', 'FollowThrough', 'Settings']),
		projects: ['inbox'],
		notes: 3,
		revisions: [1, 1, 1]
	});
});

it('includes built-in skills and their Inbox in the first browser synchronization page', async () => {
	const state = setup();
	const page = await state.workspace.pullChangePage(actor('812'), syncCursorSchema.parse('0'));
	const records = page.records.flatMap((record) =>
		record.resource.kind === 'found' ? [record.resource.snapshot.value] : []
	);
	expect(
		records
			.filter((record) => record.type === 'projects' || record.type === 'skills')
			.map((record) => record.type)
			.sort()
	).toEqual(['projects', 'skills', 'skills', 'skills']);
});
