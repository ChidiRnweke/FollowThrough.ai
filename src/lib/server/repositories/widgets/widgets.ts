import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';

/** The revisions a write was computed from. A write against any other revision is refused. */
export interface WidgetRevisions {
	readonly layoutRevision: number;
	readonly dataRevision: number;
}

export interface WidgetRepository {
	findById(actor: ActorContext, id: WidgetId): Promise<Widget | undefined>;
	/** Locks the row for the rest of the transaction, so the edit rule sees the current widget. */
	findByIdForUpdate(actor: ActorContext, id: WidgetId): Promise<Widget | undefined>;
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Widget[]>;
	insert(actor: ActorContext, widget: Widget): Promise<Widget>;
	update(actor: ActorContext, widget: Widget, from: WidgetRevisions): Promise<Widget>;
}
