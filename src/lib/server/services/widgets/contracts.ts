import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';
import type { WidgetRevisions } from '$lib/server/repositories/widgets';

export interface WidgetReader {
	get(actor: ActorContext, widgetId: WidgetId): Promise<Widget>;
}
export interface WidgetLister {
	listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Widget[]>;
}
export interface WidgetWriter {
	/** The current widget, locked until the transaction ends. */
	getForEdit(actor: ActorContext, widgetId: WidgetId): Promise<Widget>;
	create(actor: ActorContext, widget: Widget): Promise<Widget>;
	update(actor: ActorContext, widget: Widget, from: WidgetRevisions): Promise<Widget>;
}
