import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView,
	RemoveAttachmentResult,
	StoredObjectInfo
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { TodoId } from '$lib/models/todos';
import type {
	AttachmentLifecycle,
	AttachmentReader,
	AttachmentUploads
} from '$lib/server/services/attachments/library';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';
import { NotFoundError } from '$lib/errors';
import { testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const version = (attachmentId: AttachmentId): AttachmentVersion => ({
	id: `${attachmentId}-v1` as AttachmentVersion['id'],
	attachmentId,
	objectKey: `objects/${attachmentId}`,
	mediaType: 'image/png',
	byteSize: 128,
	checksumSha256: 'a'.repeat(64),
	processingStatus: 'queued',
	createdAt: testNow
});

export interface TodoAttachmentLink {
	readonly attachmentId: AttachmentId;
	readonly todoId: TodoId;
}

export const attachmentViewBuilder = (
	attachmentId: AttachmentId,
	path = 'screenshot.png'
): AttachmentView => ({
	attachment: {
		id: attachmentId,
		projectId: testProjectId(),
		path,
		currentVersionId: version(attachmentId).id,
		createdAt: testNow,
		updatedAt: testNow
	},
	version: version(attachmentId)
});

/**
 * Records the attachment lifecycle in memory. Only the paths a controller test
 * actually crosses are implemented; the rest throw so an unexpected call is a
 * loud failure rather than a silent success.
 */
export class InMemoryAttachments
	implements AttachmentUploads, AttachmentReader, AttachmentLifecycle, SnapshotParticipant
{
	/** Upload reservations that can be finalized, keyed by upload id. */
	uploads = new Map<string, AttachmentView>();
	finalized: AttachmentView[] = [];
	todoLinks: TodoAttachmentLink[] = [];
	/** Attachments handed to background processing, in call order. */
	/** Set to make `linkToTodo` fail the way a foreign attachment would. */
	linkFails = false;

	snapshot(): RestoreSnapshot {
		const finalized = [...this.finalized];
		const todoLinks = [...this.todoLinks];
		return () => {
			this.finalized = [...finalized];
			this.todoLinks = [...todoLinks];
		};
	}

	initiate(): Promise<{ upload: AttachmentUpload; requiredHeaders: Record<string, string> }> {
		throw new Error('not used');
	}
	async pending(_actor: ActorContext, uploadId: AttachmentUpload['id']): Promise<AttachmentUpload> {
		const reserved = this.uploads.get(uploadId);
		if (!reserved) throw new NotFoundError('Attachment upload was not found');
		return {
			id: uploadId,
			projectId: reserved.attachment.projectId,
			path: reserved.attachment.path,
			objectKey: `staging/${uploadId}`,
			mediaType: reserved.version.mediaType,
			byteSize: reserved.version.byteSize,
			checksumSha256: reserved.version.checksumSha256,
			expiresAt: testNow,
			createdAt: testNow
		};
	}
	planVersion(
		_actor: ActorContext,
		upload: AttachmentUpload,
		_stored: StoredObjectInfo
	): AttachmentVersion {
		const reserved = this.uploads.get(upload.id);
		if (!reserved) throw new NotFoundError('Attachment upload was not found');
		return reserved.version;
	}
	async finalize(
		_actor: ActorContext,
		upload: AttachmentUpload,
		_version: AttachmentVersion
	): Promise<AttachmentView> {
		const reserved = this.uploads.get(upload.id);
		if (!reserved) throw new NotFoundError('Attachment upload was not found');
		this.finalized = [...this.finalized, reserved];
		return reserved;
	}
	async get(_actor: ActorContext, id: AttachmentId): Promise<AttachmentView> {
		const found = this.finalized.find((view) => view.attachment.id === id);
		if (!found) throw new NotFoundError('Attachment was not found');
		return found;
	}
	list(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	listForProject(): Promise<readonly AttachmentView[]> {
		throw new Error('not used');
	}
	async linkToTodo(
		_actor: ActorContext,
		attachmentId: AttachmentId,
		todoId: TodoId
	): Promise<void> {
		if (this.linkFails) throw new NotFoundError('Attachment was not found');
		this.todoLinks = [...this.todoLinks, { attachmentId, todoId }];
	}
	async listForTodo(_actor: ActorContext, todoId: TodoId): Promise<readonly AttachmentView[]> {
		return this.todoLinks
			.filter((link) => link.todoId === todoId)
			.flatMap((link) => this.finalized.filter((view) => view.attachment.id === link.attachmentId));
	}
	retry(): Promise<AttachmentView> {
		throw new Error('not used');
	}
	removeById(): Promise<RemoveAttachmentResult> {
		throw new Error('not used');
	}
	locate(): Promise<AttachmentView> {
		throw new Error('not used');
	}
	read(): Promise<{ text: string; offset: number; nextOffset?: number; parserKind: string }> {
		throw new Error('not used');
	}
	remove(_actor: ActorContext, _noteId: NoteId, _path: string): Promise<AttachmentId | undefined> {
		throw new Error('not used');
	}
}

/** An upload reservation keyed the way {@link InMemoryAttachments.pending} expects. */
export const reserveUpload = (
	attachments: InMemoryAttachments,
	uploadId: string,
	attachmentId: AttachmentId
): AttachmentView => {
	const view = attachmentViewBuilder(attachmentId);
	attachments.uploads.set(uploadId, view);
	return view;
};
