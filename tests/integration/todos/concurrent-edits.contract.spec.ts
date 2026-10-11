import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import type { ActorContext } from '$lib/models/identity';
import { Todos, type TodosDependencies } from '$lib/server/controllers/todos/controller';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createTodosCapability } from '$lib/server/factories/capabilities/todos-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { TodoPresentationService } from '$lib/services/todos/presentation';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import postgres from 'postgres';
import { expect, it, vi } from 'vitest';
import { context, seedNote } from '../database-harness';

const editor = (
	actor: ActorContext,
	connection: ReturnType<typeof connectPostgresTestDatabase>
) => {
	const { database, transactionRunner } = createTransactionContext(connection.db);
	const projects = new ProjectRecords(actor, database);
	const notes = createNotesCapability(actor, { now: testClock, db: database, projects });
	const { catalog } = createTodosCapability(actor, {
		now: testClock,
		db: database,
		projects,
		notes: notes.repository,
		anchors: notes.anchors,
		provenance: notes.provenanceRepository
	});
	return new Todos(
		actor,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<TodosDependencies>({
			now: testClock,
			...agentToolResultsFixture(),
			boardExport: new TodoBoardExportService(),
			todoPresentation: new TodoPresentationService(),
			todoEditingRules: new TodoEditingRulesService(),
			todoCreationRules: new TodoEditingRulesService(),
			todoLibrary: catalog,
			transactionRunner
		})
	);
};

it('preserves both independent edits when two task updates wait for the same row', async () => {
	const { owner, project } = await seedNote('14901');
	const records = new TodoRecords(owner, context.db);
	const task = await records.insert(
		todoBuilder({
			id: testTodoId(14901),
			userId: owner.userId,
			projectId: project.id,
			title: 'Original',
			description: 'Original description'
		})
	);
	const first = connectPostgresTestDatabase(context.url);
	const second = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const locking = blocker.begin(async (transaction) => {
		await transaction`select id from todos where id = ${task.id} for update`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [firstBackend] = await first.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const [secondBackend] = await second.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writes = Promise.all([
			editor(owner, first).update({ todoId: task.id, title: 'New title' }),
			editor(owner, second).update({ todoId: task.id, description: 'New description' })
		]);
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid in (${firstBackend!.pid}, ${secondBackend!.pid}) and wait_event_type = 'Lock'`;
			if (waiting.length !== 2) throw new Error('Both task edits have not reached the locked row');
		});
		release.resolve();
		await locking;
		await writes;
		const stored = await records.findById(task.id);
		expect({ title: stored?.title, description: stored?.description }).toEqual({
			title: 'New title',
			description: 'New description'
		});
	} finally {
		release.resolve();
		await locking;
		await Promise.all([first.close(), second.close(), blocker.end()]);
	}
});
