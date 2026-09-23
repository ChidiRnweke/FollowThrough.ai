import { describe, expect, it } from 'vitest';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import { Attachments, type AttachmentsDependencies } from './controller';
import {
	InMemoryAttachments,
	reserveUpload
} from '$lib/testing/attachments/fakes/in-memory-attachments';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { NotFoundError } from '$lib/errors';
import {
	testActor,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';

const UPLOAD_ID = '00000000-0000-4000-8000-0000000000c1' as AttachmentUploadId;
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;

const setup = () => {
	const attachments = new InMemoryAttachments();
	const todos = new InMemoryTodos();
	todos.todos = [todoBuilder(), todoBuilder({ id: testTodoId(2) })];
	return {
		attachments,
		todos,
		controller: new Attachments(
			capabilityDependencies<AttachmentsDependencies>({
				attachments,
				todoReader: todos,
				transactionRunner: new InMemoryTransactionRunner([attachments])
			})
		)
	};
};

describe('Completing a todo screenshot', () => {
	it('links the finalized attachment to the todo', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		expect(attachments.todoLinks).toEqual([{ attachmentId: ATTACHMENT_ID, todoId: testTodoId() }]);
	});

	it('returns the attachment the description should link to', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		const view = await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		expect(view.attachment.id).toBe(ATTACHMENT_ID);
	});

	// The link and the attachment commit together, so a screenshot is never left
	// as a project file that no todo claims.
	it('rolls the finalized attachment back when the link fails', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		attachments.linkFails = true;
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId()).catch(() => undefined);
		expect(attachments.finalized).toEqual([]);
	});

	it('lists the screenshots a todo references', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		const listed = await controller.listForTodo(testActor(), testTodoId());
		expect(listed.map((view) => view.attachment.id)).toEqual([ATTACHMENT_ID]);
	});

	it('does not list another todo screenshots', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		const listed = await controller.listForTodo(testActor(), testTodoId(2));
		expect(listed).toEqual([]);
	});
});

describe('Unavailable screenshot targets', () => {
	it('rejects completion when the task was deleted after upload reservation', async () => {
		const { attachments, todos, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await todos.softDelete(testActor(), testTodoId());
		await expect(
			controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId())
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('rejects completion for a missing task', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await expect(
			controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId(3))
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('does not list screenshots after task deletion', async () => {
		const { attachments, todos, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		await todos.softDelete(testActor(), testTodoId());
		await expect(controller.listForTodo(testActor(), testTodoId())).rejects.toBeInstanceOf(
			NotFoundError
		);
	});
});
