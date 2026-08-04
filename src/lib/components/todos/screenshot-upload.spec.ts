import { describe, expect, it } from 'vitest';
import type { AttachmentUploadId } from '$lib/models/attachments';
import type { TodoId } from '$lib/models/todos';
import {
	testNow,
	testProjectId,
	testTodoId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { uploadTodoScreenshot, type ScreenshotUploadTransport } from './screenshot-upload';

type Initiated = Parameters<ScreenshotUploadTransport['initiate']>[0];

/** Records what the helper asked of the server, and replays a happy upload. */
const recordingTransport = (
	overrides: { ok?: boolean; status?: number; body?: string } = {}
): {
	transport: ScreenshotUploadTransport;
	initiated: Initiated[];
	completed: { uploadId: string; todoId: TodoId }[];
} => {
	const initiated: Initiated[] = [];
	const completed: { uploadId: string; todoId: TodoId }[] = [];
	const intent: Awaited<ReturnType<ScreenshotUploadTransport['initiate']>> = {
		upload: {
			id: 'upload-1' as AttachmentUploadId,
			projectId: testProjectId(),
			path: 'todos/x/shot.png',
			objectKey: 'staging/shot.png',
			mediaType: 'image/png',
			byteSize: 3,
			checksumSha256: 'a'.repeat(64),
			expiresAt: testNow,
			createdAt: testNow
		},
		uploadUrl: 'https://storage.test/put',
		requiredHeaders: { 'content-type': 'image/png' }
	};
	return {
		initiated,
		completed,
		transport: {
			initiate: async (input) => {
				initiated.push(input);
				return intent;
			},
			put: async () =>
				new Response(overrides.body ?? '', {
					status: overrides.ok === false ? (overrides.status ?? 403) : 200
				}),
			complete: async (uploadId, todoId) => {
				completed.push({ uploadId, todoId });
				return {
					attachment: { id: 'attachment-1' }
				} as Awaited<ReturnType<ScreenshotUploadTransport['complete']>>;
			}
		}
	};
};

const screenshot = (): File =>
	new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });

describe('uploadTodoScreenshot', () => {
	it('returns the stable content url to link from the description', async () => {
		const { transport } = recordingTransport();
		const url = await uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport);
		expect(url).toBe('/api/attachments/attachment-1/content');
	});

	// Namespacing by todo is what keeps two todos in one project from colliding
	// on the project-scoped unique attachment path.
	it('namespaces the object path under the todo', async () => {
		const { transport, initiated } = recordingTransport();
		await uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport);
		expect(initiated[0]?.path).toMatch(new RegExp(`^todos/${testTodoId()}/\\d+-shot\\.png$`));
	});

	it('initiates as a project attachment rather than a note one', async () => {
		const { transport, initiated } = recordingTransport();
		await uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport);
		expect(initiated[0]?.noteId).toBeUndefined();
	});

	it('completes through the todo-linking command', async () => {
		const { transport, completed } = recordingTransport();
		await uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport);
		expect(completed).toEqual([{ uploadId: 'upload-1', todoId: testTodoId() }]);
	});

	it('does not complete an upload whose bytes were rejected', async () => {
		const { transport, completed } = recordingTransport({ ok: false });
		await uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport).catch(
			() => undefined
		);
		expect(completed).toEqual([]);
	});

	it('surfaces the storage error detail', async () => {
		const { transport } = recordingTransport({
			ok: false,
			body: '<Error><Message>Entity too large</Message></Error>'
		});
		await expect(
			uploadTodoScreenshot(testTodoId(), testProjectId(), screenshot(), transport)
		).rejects.toThrow('Entity too large');
	});
});
