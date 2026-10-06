import type {
	Attachment,
	AttachmentId,
	AttachmentVersion,
	AttachmentVersionId,
	AttachmentView
} from '$lib/models/attachments';
import { testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

export const testAttachmentId = (value = 1): AttachmentId =>
	`00000000-0000-4000-8098-${String(value).padStart(12, '0')}` as AttachmentId;

const testAttachmentVersionId = (value = 1): AttachmentVersionId =>
	`00000000-0000-4000-8097-${String(value).padStart(12, '0')}` as AttachmentVersionId;

/** A project file whose text was extracted, as processing leaves a readable PDF. */
export const attachmentViewBuilder = (
	overrides: {
		readonly attachment?: Partial<Attachment>;
		readonly version?: Partial<AttachmentVersion>;
	} = {}
): AttachmentView => ({
	attachment: {
		id: testAttachmentId(),
		projectId: testProjectId(),
		path: 'brief.pdf',
		currentVersionId: testAttachmentVersionId(),
		createdAt: testNow,
		updatedAt: testNow,
		...overrides.attachment
	},
	version: {
		id: testAttachmentVersionId(),
		attachmentId: overrides.attachment?.id ?? testAttachmentId(),
		objectKey: 'attachments/brief.pdf',
		mediaType: 'application/pdf',
		byteSize: 1024,
		checksumSha256: 'a'.repeat(64),
		parserKind: 'pdf',
		extractedText: 'The launch moves to March.',
		processingStatus: 'ready',
		createdAt: testNow,
		...overrides.version
	}
});
