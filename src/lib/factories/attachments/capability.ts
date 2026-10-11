import { Attachments, type AttachmentsController } from '$lib/controllers/attachments/controller';
import { AttachmentUploadService } from '$lib/services/attachments/uploads';
import { BrowserAttachmentFiles } from '$lib/client/attachments/browser';
import { RemoteAttachments } from '$lib/client/attachments/remote-transport';
export const attachmentsController: AttachmentsController = new Attachments(
	new RemoteAttachments(),
	new BrowserAttachmentFiles(),
	new AttachmentUploadService()
);
