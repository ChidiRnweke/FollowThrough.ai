import {
	initiateAttachmentUpload,
	completeAttachmentUpload,
	completeTodoScreenshotUpload
} from '$lib/remote/attachments/attachments.remote';
import type { AttachmentRemotePort } from '$lib/controllers/attachments/controller';
import type { AttachmentUploadRequest } from '$lib/models/attachments';
import type { TodoId } from '$lib/models/todos';
export class RemoteAttachments implements AttachmentRemotePort {
	initiate(input: AttachmentUploadRequest) {
		return initiateAttachmentUpload(input);
	}
	complete(uploadId: string) {
		return completeAttachmentUpload({ uploadId });
	}
	completeScreenshot(uploadId: string, todoId: TodoId) {
		return completeTodoScreenshotUpload({ uploadId, todoId });
	}
}
