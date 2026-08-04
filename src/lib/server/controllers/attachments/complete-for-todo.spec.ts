import { describe, expect, it } from 'vitest';
import type { AttachmentId, AttachmentUploadId } from '$lib/models/attachments';
import { Attachments, type AttachmentsDependencies } from './controller';
import {
	InMemoryAttachments,
	reserveUpload
} from '$lib/testing/attachments/fakes/in-memory-attachments';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';

const UPLOAD_ID = '00000000-0000-4000-8000-0000000000c1' as AttachmentUploadId;
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1' as AttachmentId;

const setup = () => {
	const attachments = new InMemoryAttachments();
	return {
		attachments,
		controller: new Attachments(
			capabilityDependencies<AttachmentsDependencies>({
				attachments,
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

	it('starts processing once the link is committed', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId());
		expect(attachments.processed).toEqual([ATTACHMENT_ID]);
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

	it('does not start processing for an attachment that failed to link', async () => {
		const { attachments, controller } = setup();
		reserveUpload(attachments, UPLOAD_ID, ATTACHMENT_ID);
		attachments.linkFails = true;
		await controller.completeForTodo(testActor(), UPLOAD_ID, testTodoId()).catch(() => undefined);
		expect(attachments.processed).toEqual([]);
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
