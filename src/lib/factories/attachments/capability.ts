import { noteEditorCapabilities } from '$lib/factories/notes/editor-capabilities';
import { Attachments, type AttachmentsController } from '$lib/controllers/attachments/controller';
import { AttachmentUploadService } from '$lib/services/attachments/uploads';
import { BrowserAttachmentFiles } from '$lib/client/attachments/browser';
import { RemoteAttachments } from '$lib/client/attachments/remote-transport';
import {
	workspaceSessionState,
	workspaceSessionEnvironment
} from '$lib/factories/workspace/session';
import { workspaceAccounts } from '$lib/factories/workspace/capabilities';
import { AttachmentViewStore } from '$lib/stores/attachments/view.svelte';
import { AttachmentPresentationService } from '$lib/services/attachments/presentation';
import { WorkspaceProjectionService } from '$lib/services/sync/state';
export const attachmentsController: AttachmentsController = new Attachments(
	new RemoteAttachments(),
	new BrowserAttachmentFiles(),
	new AttachmentUploadService(),
	workspaceSessionState,
	workspaceAccounts,
	workspaceSessionEnvironment,
	new AttachmentViewStore(),
	new AttachmentPresentationService(),
	new WorkspaceProjectionService(),
	noteEditorCapabilities
);
