import { ConflictError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';
import type { WidgetRepository, WidgetRevisions } from '$lib/server/repositories/widgets';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

/** Widget storage with the Postgres revision guard: a write from an older revision is refused. */
export class InMemoryWidgetRepository implements WidgetRepository, SnapshotParticipant {
	widgets: Widget[] = [];

	async findById(actor: ActorContext, id: WidgetId): Promise<Widget | undefined> {
		return this.widgets.find((widget) => widget.id === id && widget.userId === actor.userId);
	}

	async findByIdForUpdate(actor: ActorContext, id: WidgetId): Promise<Widget | undefined> {
		return this.findById(actor, id);
	}

	async listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Widget[]> {
		return this.widgets.filter(
			(widget) =>
				widget.userId === actor.userId &&
				widget.projectId === projectId &&
				widget.archivedAt === undefined
		);
	}

	async insert(_actor: ActorContext, widget: Widget): Promise<Widget> {
		this.widgets.push(widget);
		return widget;
	}

	async update(actor: ActorContext, widget: Widget, from: WidgetRevisions): Promise<Widget> {
		const current = await this.findById(actor, widget.id);
		if (
			!current ||
			current.layoutRevision !== from.layoutRevision ||
			current.dataRevision !== from.dataRevision
		)
			throw new ConflictError('The widget changed while it was being saved');
		this.widgets = this.widgets.map((item) => (item.id === widget.id ? widget : item));
		return widget;
	}

	snapshot(): RestoreSnapshot {
		const widgets = this.widgets;
		return () => {
			this.widgets = widgets;
		};
	}
}
