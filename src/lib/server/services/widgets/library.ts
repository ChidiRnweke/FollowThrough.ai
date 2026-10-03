import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';
import { NotFoundError, OwnershipError } from '$lib/errors';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { WidgetRepository, WidgetRevisions } from '$lib/server/repositories/widgets';

/** Storage rules for widgets: ownership and project scope. The edit rule is shared (ADR 0043). */
export class WidgetLibrary {
	constructor(
		private readonly widgets: WidgetRepository,
		private readonly projects: ProjectRepository
	) {}

	async get(actor: ActorContext, widgetId: WidgetId): Promise<Widget> {
		const widget = await this.widgets.findById(actor, widgetId);
		if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
		return widget;
	}

	async listForProject(actor: ActorContext, projectId: ProjectId): Promise<readonly Widget[]> {
		await this.requireProject(actor, projectId);
		return this.widgets.listForProject(actor, projectId);
	}

	async getForEdit(actor: ActorContext, widgetId: WidgetId): Promise<Widget> {
		const widget = await this.widgets.findByIdForUpdate(actor, widgetId);
		if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
		return widget;
	}

	async create(actor: ActorContext, widget: Widget): Promise<Widget> {
		if (widget.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s widget');
		await this.requireProject(actor, widget.projectId);
		return this.widgets.insert(actor, widget);
	}

	async update(actor: ActorContext, widget: Widget, from: WidgetRevisions): Promise<Widget> {
		if (widget.userId !== actor.userId)
			throw new OwnershipError('Cannot edit another user’s widget');
		return this.widgets.update(actor, widget, from);
	}

	private async requireProject(actor: ActorContext, projectId: ProjectId): Promise<void> {
		if (!(await this.projects.findById(actor, projectId)))
			throw new NotFoundError('Widget project was not found', { projectId });
	}
}
