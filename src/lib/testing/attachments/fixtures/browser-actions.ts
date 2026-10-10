import { Attachments } from '$lib/controllers/attachments/controller';
import { AttachmentUploadService } from '$lib/services/attachments/uploads';
import {
	InMemoryAttachmentBrowser,
	InMemoryAttachmentRemote,
	InMemoryAttachmentWorkspace
} from '$lib/testing/attachments/fakes/browser-actions';
export const attachmentActionsFixture = () => {
	const remote = new InMemoryAttachmentRemote();
	const browser = new InMemoryAttachmentBrowser();
	const workspace = new InMemoryAttachmentWorkspace();
	return {
		remote,
		browser,
		workspace,
		controller: new Attachments(remote, browser, new AttachmentUploadService(), workspace)
	};
};
