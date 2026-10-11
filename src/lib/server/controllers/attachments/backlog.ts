import type {
	AttachmentBacklog,
	PendingAttachmentVersion
} from '$lib/server/services/attachments/records';

/** Attachment versions waiting for extraction across every user; each is processed as its owner. */
export interface AttachmentBacklogController {
	pendingVersions(): Promise<readonly PendingAttachmentVersion[]>;
}
export class AttachmentBacklogReader implements AttachmentBacklogController {
	constructor(private readonly backlog: Pick<AttachmentBacklog, 'listPendingVersions'>) {}
	pendingVersions() {
		return this.backlog.listPendingVersions();
	}
}
