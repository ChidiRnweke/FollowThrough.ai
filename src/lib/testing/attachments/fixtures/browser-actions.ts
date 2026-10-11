import { Attachments } from '$lib/controllers/attachments/controller';
import { AttachmentUploadService } from '$lib/services/attachments/uploads';
import {
	InMemoryAttachmentBrowser,
	InMemoryAttachmentRemote
} from '$lib/testing/attachments/fakes/browser-actions';
export const attachmentActionsFixture = () => {
	const remote = new InMemoryAttachmentRemote();
	const browser = new InMemoryAttachmentBrowser();
	return {
		remote,
		browser,
		controller: new Attachments(remote, browser, new AttachmentUploadService())
	};
};
