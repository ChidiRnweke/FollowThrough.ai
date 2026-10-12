import { NotFoundError } from '$lib/errors';
import type { AttachmentId, AttachmentView } from '$lib/models/attachments';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';
import type { Widget, WidgetId } from '$lib/models/widgets';

/**
 * The widgets, diagrams and files a chat can attach, held by id and owned by any actor, and
 * the files a project lists for its connection map.
 */
export class InMemoryContextResources {
	widgets: Widget[] = [];
	diagrams: Diagram[] = [];
	attachments: AttachmentView[] = [];

	readonly widgetReader = {
		get: async (widgetId: WidgetId): Promise<Widget> => {
			const widget = this.widgets.find((candidate) => candidate.id === widgetId);
			if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
			return widget;
		}
	};

	readonly diagramReader = {
		get: async (diagramId: DiagramId): Promise<Diagram> => {
			const diagram = this.diagrams.find((candidate) => candidate.id === diagramId);
			if (!diagram) throw new NotFoundError('Diagram was not found', { diagramId });
			return diagram;
		}
	};

	readonly attachmentReader = {
		get: async (attachmentId: AttachmentId): Promise<AttachmentView> => {
			const view = this.attachments.find((candidate) => candidate.attachment.id === attachmentId);
			if (!view) throw new NotFoundError('Attachment was not found', { attachmentId });
			return view;
		},
		listForProject: async (projectId: ProjectId): Promise<readonly AttachmentView[]> =>
			this.attachments.filter((view) => view.attachment.projectId === projectId)
	};
}
