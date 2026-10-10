import { expect, it } from 'vitest';
import { attachmentActionsFixture } from '$lib/testing/attachments/fixtures/browser-actions';
import { testProjectId, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
const screenshot = () => new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
it('uploads a project screenshot under its todo and returns the completed content URL', async () => {
	const { controller, remote } = attachmentActionsFixture();
	const url = await controller.uploadScreenshot(testTodoId(), testProjectId(), screenshot());
	expect({
		path: remote.initiated[0].path,
		projectId: remote.initiated[0].projectId,
		noteId: remote.initiated[0].noteId,
		completed: remote.completed,
		url
	}).toEqual({
		path: `todos/${testTodoId()}/1783857600000-shot.png`,
		projectId: testProjectId(),
		noteId: undefined,
		completed: [{ uploadId: remote.uploadId, todoId: testTodoId() }],
		url: `/api/attachments/${remote.result.attachment.id}/content`
	});
});
it('surfaces storage rejection without completing a screenshot', async () => {
	const { controller, remote, browser } = attachmentActionsFixture();
	browser.writeResult = { kind: 'failure', status: 403, detail: 'Entity too large' };
	const outcome = await controller
		.uploadScreenshot(testTodoId(), testProjectId(), screenshot())
		.then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
	expect({ outcome, completed: remote.completed }).toEqual({
		outcome: 'Object storage rejected the screenshot: Entity too large',
		completed: []
	});
});
