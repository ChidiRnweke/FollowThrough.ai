import type { ActorContext } from '$lib/models/identity';
import { InMemoryAttachmentStorage } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { NotFoundError } from '$lib/errors';
import {
	Attachments,
	type AttachmentsDependencies
} from '$lib/server/controllers/attachments/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createTodoServices } from '$lib/server/factories/capabilities/todos-capability-factory';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryAttachments,
	reserveUpload
} from '$lib/testing/attachments/fakes/in-memory-attachments';
import { ATTACHMENT_ID, UPLOAD_ID } from '$lib/testing/attachments/fakes/processing';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testTodoId, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { actor, context, now, seedNote } from '../database-harness';
import { treeControllers } from '../project-tree-harness';

const setup = async (identity: number) => {
	const seeded = await seedNote(String(identity));
	const { database, transactionRunner } = createTransactionContext(context.db);
	const records = new TodoRecords(seeded.owner, database);
	const todo = await records.insert(
		todoBuilder({
			id: testTodoId(identity),
			userId: seeded.owner.userId,
			projectId: seeded.project.id
		})
	);
	// Attachment effects stay outside the database transaction, like object storage.
	// Rejection must precede completion; a database rollback cannot undo this fake.
	const attachments = new InMemoryAttachments();
	const view = reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
	attachments.uploads.set(UPLOAD_ID, {
		...view,
		attachment: { ...view.attachment, projectId: seeded.project.id }
	});
	const controllerFor = (actor: ActorContext) => {
		const catalog = createTodoServices(
			actor,
			new TodoRecords(actor, database),
			new ProjectRecords(actor, database),
			new SourceAnchorRecords(actor, database),
			new NoteRecords(actor, database),
			new ProvenanceRecords(actor, database)
		);
		return new Attachments(
			capabilityDependencies<AttachmentsDependencies>({
				...agentToolResultsFixture(),
				uploads: attachments,
				reader: attachments,
				lifecycle: attachments,
				storage: new InMemoryAttachmentStorage(),
				todoReader: catalog.reader,
				transactionRunner
			})
		);
	};
	const controller = controllerFor(seeded.owner);
	return {
		...seeded,
		todo,
		records,
		attachments,
		controller,
		controllerFor,
		database,
		transactionRunner
	};
};

it('does not finalize a screenshot when its task was deleted before completion', async () => {
	const { todo, records, controller, attachments } = await setup(21601);
	await records.softDelete(todo.id, now);
	const outcome = await controller.completeForTodo(UPLOAD_ID, todo.id).then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ outcome, finalized: attachments.finalized, links: attachments.todoLinks }).toEqual({
		outcome: 'Todo was not found',
		finalized: [],
		links: []
	});
});

it('does not finalize a screenshot after its task project is archived', async () => {
	const { owner, project, todo, controller, attachments, database, transactionRunner } =
		await setup(21602);
	await treeControllers(owner, database, transactionRunner).projects.archive({
		projectId: project.id
	});
	const outcome = await controller.completeForTodo(UPLOAD_ID, todo.id).then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ outcome, finalized: attachments.finalized, links: attachments.todoLinks }).toEqual({
		outcome: 'Todo was not found',
		finalized: [],
		links: []
	});
});

it('does not finalize an owned upload for another accounts task', async () => {
	const { controller, attachments } = await setup(21603);
	const foreign = await setup(21604);
	const outcome = await controller.completeForTodo(UPLOAD_ID, foreign.todo.id).then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ outcome, finalized: attachments.finalized, links: attachments.todoLinks }).toEqual({
		outcome: 'Todo was not found',
		finalized: [],
		links: []
	});
});

it('completes and lists a screenshot for an active owned task', async () => {
	const { todo, controller } = await setup(21605);
	await controller.completeForTodo(UPLOAD_ID, todo.id);
	expect((await controller.listForTodo(todo.id)).map(({ attachment }) => attachment.id)).toEqual([
		ATTACHMENT_ID
	]);
});

it('rejects screenshot listing after project archival', async () => {
	const { owner, project, todo, controller, database, transactionRunner } = await setup(21606);
	await controller.completeForTodo(UPLOAD_ID, todo.id);
	await treeControllers(owner, database, transactionRunner).projects.archive({
		projectId: project.id
	});
	await expect(controller.listForTodo(todo.id)).rejects.toBeInstanceOf(NotFoundError);
});

it('rejects screenshot listing for another accounts task', async () => {
	const { todo, controller, controllerFor } = await setup(21607);
	await controller.completeForTodo(UPLOAD_ID, todo.id);
	await expect(controllerFor(actor('21608')).listForTodo(todo.id)).rejects.toBeInstanceOf(
		NotFoundError
	);
});
