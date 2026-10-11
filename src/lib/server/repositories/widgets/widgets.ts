import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';

/** The revisions a write was computed from. A write against any other revision is refused. */
export interface WidgetRevisions {
	readonly layoutRevision: number;
	readonly dataRevision: number;
}

export interface WidgetRepository {
	findById(id: WidgetId): Promise<Widget | undefined>;
	/** Locks the row for the rest of the transaction, so the edit rule sees the current widget. */
	findByIdForUpdate(id: WidgetId): Promise<Widget | undefined>;
	listForProject(projectId: ProjectId): Promise<readonly Widget[]>;
	insert(widget: Widget): Promise<Widget>;
	update(widget: Widget, from: WidgetRevisions): Promise<Widget>;
	/** Removes a widget that is in the trash. Notes that embed it then show it as unavailable. */
	deleteArchived(id: WidgetId): Promise<void>;
}
