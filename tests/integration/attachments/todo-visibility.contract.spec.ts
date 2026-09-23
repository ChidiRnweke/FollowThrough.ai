import { expect, it } from 'vitest';
import { NotFoundError } from '$lib/errors';
import {
	Attachments,
	type AttachmentsDependencies
} from '$lib/server/controllers/attachments/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { TodoCatalog } from '$lib/server/services/todos/catalog';
import { TodoRecords } from '$lib/server/repositories/todos/postgres/todos';
import { NoteRecords, SourceAnchorRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import {
	InMemoryAttachments,
	reserveUpload
} from '$lib/testing/attachments/fakes/in-memory-attachments';
import { ATTACHMENT_ID, UPLOAD_ID } from '$lib/testing/attachments/fakes/processing';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { actor, context, now, seedNote } from '../database-harness';
import { treeControllers } from '../project-tree-harness';

const setup = async (identity: number) => {
	const seeded = await seedNote(String(identity));
	const { database, transactionRunner } = createTransactionContext(context.db);
	const records = new TodoRecords(database);
	const todo = await records.insert(
		seeded.owner,
		todoBuilder({
			id: testTodoId(identity),
			userId: seeded.owner.userId,
			projectId: seeded.project.id
		})
	);
	const catalog = new TodoCatalog(
		records,
		new ProjectRecords(database),
		new SourceAnchorRecords(database),
		new NoteRecords(database),
		new ProvenanceRecords(database)
	);
	// Attachment effects stay outside the database transaction, like object storage.
	// Rejection must precede completion; a database rollback cannot undo this fake.
	const attachments = new InMemoryAttachments();
	const view = reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
	attachments.uploads.set(UPLOAD_ID, {
		...view,
		attachment: { ...view.attachment, projectId: seeded.project.id }
	});
	const controller = new Attachments(
		capabilityDependencies<AttachmentsDependencies>({
			attachments,
			todoReader: catalog,
			transactionRunner
		})
	);
	return { ...seeded, todo, records, attachments, controller, database, transactionRunner };
};

it('does not finalize a screenshot when its task was deleted before completion', async () => {
	const { owner, todo, records, controller, attachments } = await setup(21601);
	await records.softDelete(owner, todo.id, now);
	const outcome = await controller.completeForTodo(owner, UPLOAD_ID, todo.id).then(
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
	await treeControllers(database, transactionRunner).projects.archive(owner, {
		projectId: project.id
	});
	const outcome = await controller.completeForTodo(owner, UPLOAD_ID, todo.id).then(
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
	const outcome = await controller.completeForTodo(actor('21603'), UPLOAD_ID, foreign.todo.id).then(
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
	const { owner, todo, controller } = await setup(21605);
	await controller.completeForTodo(owner, UPLOAD_ID, todo.id);
	expect(
		(await controller.listForTodo(owner, todo.id)).map(({ attachment }) => attachment.id)
	).toEqual([ATTACHMENT_ID]);
});

it('rejects screenshot listing after project archival', async () => {
	const { owner, project, todo, controller, database, transactionRunner } = await setup(21606);
	await controller.completeForTodo(owner, UPLOAD_ID, todo.id);
	await treeControllers(database, transactionRunner).projects.archive(owner, {
		projectId: project.id
	});
	await expect(controller.listForTodo(owner, todo.id)).rejects.toBeInstanceOf(NotFoundError);
});

it('rejects screenshot listing for another accounts task', async () => {
	const { owner, todo, controller } = await setup(21607);
	await controller.completeForTodo(owner, UPLOAD_ID, todo.id);
	await expect(controller.listForTodo(actor('21608'), todo.id)).rejects.toBeInstanceOf(
		NotFoundError
	);
});
