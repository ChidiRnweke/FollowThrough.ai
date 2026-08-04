import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import { fileChecksumSha256 } from '$lib/client/attachments/checksum';
import {
	completeTodoScreenshotUpload,
	initiateAttachmentUpload
} from '$lib/remote/attachments/attachments.remote';

type InitiateInput = Parameters<typeof initiateAttachmentUpload>[0];
type InitiateOutput = Awaited<ReturnType<typeof initiateAttachmentUpload>>;
type CompleteOutput = Awaited<ReturnType<typeof completeTodoScreenshotUpload>>;

export interface ScreenshotUploadTransport {
	initiate(input: InitiateInput): Promise<InitiateOutput>;
	put(intent: InitiateOutput, body: BodyInit): Promise<Response>;
	complete(uploadId: string, todoId: TodoId): Promise<CompleteOutput>;
}

const liveTransport: ScreenshotUploadTransport = {
	initiate: initiateAttachmentUpload,
	put: (intent, body) =>
		fetch(intent.uploadUrl, { method: 'PUT', headers: intent.requiredHeaders, body }),
	complete: (uploadId, todoId) => completeTodoScreenshotUpload({ uploadId, todoId })
};

/**
 * Namespaced by todo so two todos in one project can both hold a `screenshot.png`
 * without colliding on the project-scoped unique path, and so a screenshot's
 * origin stays readable in the project's attachment list. The timestamp keeps
 * repeated pastes of the same clipboard image distinct.
 */
const screenshotPath = (todoId: TodoId, file: File): string =>
	`todos/${todoId}/${Date.now()}-${file.name || 'screenshot.png'}`;

/**
 * Uploads a screenshot pasted into a todo description and returns the stable
 * application-owned content URL to link to.
 *
 * The attachment is initiated as a project file and only becomes the todo's on
 * completion, which is the one step that records the link.
 */
export const uploadTodoScreenshot = async (
	todoId: TodoId,
	projectId: ProjectId,
	file: File,
	transport: ScreenshotUploadTransport = liveTransport
): Promise<string> => {
	const intent = await transport.initiate({
		projectId,
		path: screenshotPath(todoId, file),
		mediaType: file.type || 'image/png',
		byteSize: file.size,
		checksumSha256: await fileChecksumSha256(file)
	});
	const stored = await transport.put(intent, file);
	if (!stored.ok) {
		const detail = (await stored.text()).match(/<Message>([^<]+)<\/Message>/)?.[1];
		throw new Error(
			detail
				? `Object storage rejected the screenshot: ${detail}`
				: `Object storage rejected the screenshot (${stored.status})`
		);
	}
	const uploaded = await transport.complete(intent.upload.id, todoId);
	return `/api/attachments/${uploaded.attachment.id}/content`;
};
