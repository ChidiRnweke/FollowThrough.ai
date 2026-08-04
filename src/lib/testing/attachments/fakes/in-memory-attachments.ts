import type { ActorContext } from '$lib/models/identity';
import type {
	AttachmentId,
	AttachmentUpload,
	AttachmentVersion,
	AttachmentView
} from '$lib/models/attachments';
import type { NoteId } from '$lib/models/notes';
import type { TodoId } from '$lib/models/todos';
import type { AttachmentManager } from '$lib/server/services/attachments/contracts';
import type { SnapshotParticipant } from '$lib/testing/workspace/fakes/in-memory-transaction';
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
export class InMemoryAttachments implements AttachmentManager, SnapshotParticipant {
	/** Upload reservations `complete` can finalize, keyed by upload id. */
	uploads = new Map<string, AttachmentView>();
	finalized: AttachmentView[] = [];
	todoLinks: TodoAttachmentLink[] = [];
	/** Attachments handed to background processing, in call order. */
	processed: AttachmentId[] = [];
	/** Set to make `linkToTodo` fail the way a foreign attachment would. */
	linkFails = false;

	snapshot(): unknown {
		return { finalized: [...this.finalized], todoLinks: [...this.todoLinks] };
	}
	restore(snapshot: unknown): void {
		const state = snapshot as { finalized: AttachmentView[]; todoLinks: TodoAttachmentLink[] };
		this.finalized = [...state.finalized];
		this.todoLinks = [...state.todoLinks];
	}

	initiate(): Promise<{
		upload: AttachmentUpload;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}> {
		throw new Error('not used');
	}
	async complete(_actor: ActorContext, uploadId: AttachmentUpload['id']): Promise<AttachmentView> {
		const reserved = this.uploads.get(uploadId);
		if (!reserved) throw new NotFoundError('Attachment upload was not found');
		this.finalized = [...this.finalized, reserved];
		return reserved;
	}
	startProcessing(_actor: ActorContext, attachment: AttachmentView): void {
		this.processed.push(attachment.attachment.id);
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
	downloadById(): Promise<{ url: string }> {
		throw new Error('not used');
	}
	retry(): Promise<AttachmentView> {
		throw new Error('not used');
	}
	removeById(): Promise<void> {
		throw new Error('not used');
	}
	download(): Promise<{ url: string }> {
		throw new Error('not used');
	}
	read(): Promise<{ text: string; offset: number; nextOffset?: number; parserKind: string }> {
		throw new Error('not used');
	}
	remove(_actor: ActorContext, _noteId: NoteId, _path: string): Promise<void> {
		throw new Error('not used');
	}
}

/** An upload reservation keyed the way {@link InMemoryAttachments.complete} expects. */
export const reserveUpload = (
	attachments: InMemoryAttachments,
	uploadId: string,
	attachmentId: AttachmentId
): AttachmentView => {
	const view = attachmentViewBuilder(attachmentId);
	attachments.uploads.set(uploadId, view);
	return view;
};
