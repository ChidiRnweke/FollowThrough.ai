import type { AttachmentUploadOwner, AttachmentView } from '$lib/models/attachments';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
export interface AttachmentPresentation {
	list(owner: AttachmentUploadOwner, records: Iterable<WorkspaceRecord>): readonly AttachmentView[];
}
/** The same ownership and current-version rules apply to every attachment list. */
export class AttachmentPresentationService implements AttachmentPresentation {
	list(
		owner: AttachmentUploadOwner,
		records: Iterable<WorkspaceRecord>
	): readonly AttachmentView[] {
		const values = [...records];
		const projects = new Set(
			values.flatMap((record) =>
				record.type === 'projects' && !record.value.archivedAt ? [record.value.id] : []
			)
		);
		const versions = new Map(
			values.flatMap((record) =>
				record.type === 'attachment_versions' ? [[record.value.id, record.value] as const] : []
			)
		);
		return values
			.flatMap((record) => {
				if (record.type !== 'attachments') return [];
				const attachment = record.value;
				if (
					!projects.has(attachment.projectId) ||
					(owner.kind === 'project'
						? attachment.projectId !== owner.id || attachment.noteId !== undefined
						: attachment.noteId !== owner.id)
				)
					return [];
				const version = attachment.currentVersionId
					? versions.get(attachment.currentVersionId)
					: undefined;
				return version
					? [{ attachment: { ...attachment, currentVersionId: version.id }, version }]
					: [];
			})
			.sort((a, b) => a.attachment.path.localeCompare(b.attachment.path));
	}
}
