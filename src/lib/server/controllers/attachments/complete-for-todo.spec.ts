import { InMemoryAttachmentStorage } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { NotFoundError } from '$lib/errors';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import {
	InMemoryAttachments,
	reserveUpload
} from '$lib/testing/attachments/fakes/in-memory-attachments';
import { InMemoryTodos } from '$lib/testing/todos/fakes/in-memory-todos';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	testActor,
	testTodoId,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Attachments, type AttachmentsDependencies } from './controller';

const UPLOAD_ID = '00000000-0000-4000-8000-0000000000c1' as AttachmentUploadId;
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;

const STAGING_KEY = `staging/${UPLOAD_ID}`;
const SCREENSHOT = new TextEncoder().encode('screenshot bytes');

const setup = () => {
	const attachments = new InMemoryAttachments();
	const storage = new InMemoryAttachmentStorage();
	const todos = new InMemoryTodos(testActor());
	todos.todos = [todoBuilder(), todoBuilder({ id: testTodoId(2) })];
	return {
		attachments,
		storage,
		todos,
		/** Reserve the upload and store its bytes the way the signed upload URL does. */
		reserve: () => {
			reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
			return storage.upload(STAGING_KEY, SCREENSHOT, 'image/png');
		},
		controller: new Attachments(
			capabilityDependencies<AttachmentsDependencies>({
				...agentToolResultsFixture(),
				uploads: attachments,
				reader: attachments,
				lifecycle: attachments,
				storage,
				todoReader: todos,
				transactionRunner: new InMemoryTransactionRunner([attachments])
			})
		)
	};
};

describe('Completing a todo screenshot', () => {
	it('links the finalized attachment to the todo', async () => {
		const { attachments, controller, reserve } = setup();
		await reserve();
		const view = await controller.completeForTodo(UPLOAD_ID, testTodoId());
		const otherTodo = await controller.listForTodo(testTodoId(2));
		expect(attachments.todoLinks).toEqual([{ attachmentId: ATTACHMENT_ID, todoId: testTodoId() }]);
		expect(view.attachment.id).toBe(ATTACHMENT_ID);
		expect(otherTodo).toEqual([]);
	});

	// The link and the attachment commit together, so a screenshot is never left
	// as a project file that no todo claims.
	it('rolls the finalized attachment back when the link fails', async () => {
		const { attachments, controller, reserve } = setup();
		await reserve();
		attachments.linkFails = true;
		await controller.completeForTodo(UPLOAD_ID, testTodoId()).catch(() => undefined);
		expect(attachments.finalized).toEqual([]);
	});

	it('lists the screenshots a todo references', async () => {
		const { controller, reserve } = setup();
		await reserve();
		await controller.completeForTodo(UPLOAD_ID, testTodoId());
		const listed = await controller.listForTodo(testTodoId());
		expect(listed.map((view) => view.attachment.id)).toEqual([ATTACHMENT_ID]);
	});
});

describe('A screenshot whose stored bytes change after verification', () => {
	it('is not finalized, linked or moved, so the upload must be sent again', async () => {
		const { attachments, storage, controller, reserve } = setup();
		await reserve();
		storage.beforePromote = () =>
			storage.upload(STAGING_KEY, new TextEncoder().encode('other bytes'), 'image/png');
		const outcome = await controller.completeForTodo(UPLOAD_ID, testTodoId()).then(
			() => 'completed',
			(error: Error) => `${error.name}: ${error.message}`
		);
		expect({
			outcome,
			finalized: attachments.finalized,
			links: attachments.todoLinks,
			storedKeys: [...storage.objects.keys()]
		}).toEqual({
			outcome:
				'ConflictError: The uploaded file changed after it was verified, so it was not saved. Upload it again.',
			finalized: [],
			links: [],
			storedKeys: [STAGING_KEY]
		});
	});
});

describe('Unavailable screenshot targets', () => {
	it('rejects completion when the task was deleted after upload reservation', async () => {
		const { todos, controller, reserve } = setup();
		await reserve();
		await todos.softDelete(testTodoId());
		await expect(controller.completeForTodo(UPLOAD_ID, testTodoId())).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('rejects completion for a missing task', async () => {
		const { controller, reserve } = setup();
		await reserve();
		await expect(controller.completeForTodo(UPLOAD_ID, testTodoId(3))).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('does not list screenshots after task deletion', async () => {
		const { todos, controller, reserve } = setup();
		await reserve();
		await controller.completeForTodo(UPLOAD_ID, testTodoId());
		await todos.softDelete(testTodoId());
		await expect(controller.listForTodo(testTodoId())).rejects.toBeInstanceOf(NotFoundError);
	});
});
