import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import type { NoteEditorState } from '$lib/models/browser-workspace';
import { projectBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import type { AttachmentView } from '$lib/models/attachments';
import { workspaceRecordIdentity, workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtagSchema, type SyncSnapshot } from '$lib/models/sync';
import { AttachmentViewStore } from '$lib/stores/attachments/view.svelte';
import { AttachmentPresentationService } from '$lib/services/attachments/presentation';
import { WorkspaceProjectionService } from '$lib/services/sync/state';
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
	const editors = new WorkspaceCapabilityStore<{ readonly state: NoteEditorState }>();
	return {
		editors,
		remote,
		browser,
		workspace,
		controller: new Attachments(
			remote,
			browser,
			new AttachmentUploadService(),
			workspace,
			workspace.accounts,
			workspace.environment,
			new AttachmentViewStore(),
			new AttachmentPresentationService(),
			new WorkspaceProjectionService(),
			editors
		)
	};
};

export const attachmentRecords = (view: AttachmentView): readonly WorkspaceRecord[] => [
	{ type: 'projects', value: projectBuilder() },
	{
		type: 'attachments',
		value: resourceDataSchemas.attachments.parse({ ...view.attachment, userId: testActor().userId })
	},
	{
		type: 'attachment_versions',
		value: resourceDataSchemas.attachment_versions.parse(view.version)
	}
];
export const publishAttachmentRecords = (
	records: readonly WorkspaceRecord[],
	target: Map<string, SyncSnapshot<WorkspaceRecord>>,
	version = 1
): void => {
	for (const value of records)
		target.set(workspaceResourceKey(workspaceRecordIdentity(value)), {
			etag: syncEtagSchema.parse(`sync-v1-${version}`),
			value
		});
};
