import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { WidgetRepository, WidgetRevisions } from '$lib/server/repositories/widgets';

/** Storage rules for widgets: ownership and project scope. The edit rule is shared (ADR 0043). */
export class WidgetLibrary implements WidgetReader, WidgetLister, WidgetWriter {
	constructor(
		private readonly actor: ActorContext,
		private readonly widgets: WidgetRepository,
		private readonly projects: ProjectRepository,
		private readonly notes: Pick<NoteRepository, 'findById'>
	) {}

	async get(widgetId: WidgetId): Promise<Widget> {
		const widget = await this.widgets.findById(widgetId);
		if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
		return widget;
	}

	async listForProject(projectId: ProjectId): Promise<readonly Widget[]> {
		await this.requireProject(projectId);
		return this.widgets.listForProject(projectId);
	}

	async getForEdit(widgetId: WidgetId): Promise<Widget> {
		const widget = await this.widgets.findByIdForUpdate(widgetId);
		if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
		return widget;
	}

	async create(widget: Widget): Promise<Widget> {
		if (widget.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s widget');
		await this.requireProject(widget.projectId);
		if (widget.sourceNoteId) {
			const note = await this.notes.findById(widget.sourceNoteId);
			if (!note) throw new NotFoundError('Widget source note was not found');
			if (note.projectId !== widget.projectId)
				throw new ValidationError('Widget source note must belong to its project');
		}
		return this.widgets.insert(widget);
	}

	async update(widget: Widget, from: WidgetRevisions): Promise<Widget> {
		if (widget.userId !== this.actor.userId)
			throw new OwnershipError('Cannot edit another user’s widget');
		return this.widgets.update(widget, from);
	}

	async deleteArchived(widgetId: WidgetId): Promise<void> {
		await this.widgets.deleteArchived(widgetId);
	}

	private async requireProject(projectId: ProjectId): Promise<void> {
		if (!(await this.projects.findById(projectId)))
			throw new NotFoundError('Widget project was not found', { projectId });
	}
}

export interface WidgetReader {
	get(widgetId: WidgetId): Promise<Widget>;
}
export interface WidgetLister {
	listForProject(projectId: ProjectId): Promise<readonly Widget[]>;
}
export interface WidgetWriter {
	/** The current widget, locked until the transaction ends. */
	getForEdit(widgetId: WidgetId): Promise<Widget>;
	create(widget: Widget): Promise<Widget>;
	update(widget: Widget, from: WidgetRevisions): Promise<Widget>;
	deleteArchived(widgetId: WidgetId): Promise<void>;
}
