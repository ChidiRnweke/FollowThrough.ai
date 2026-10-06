import { NotFoundError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId, AttachmentView } from '$lib/models/attachments';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { Widget, WidgetId } from '$lib/models/widgets';

/** The widgets, diagrams and files a chat can attach, held by id and owned by any actor. */
export class InMemoryContextResources {
	widgets: Widget[] = [];
	diagrams: Diagram[] = [];
	attachments: AttachmentView[] = [];

	readonly widgetReader = {
		get: async (_actor: ActorContext, widgetId: WidgetId): Promise<Widget> => {
			const widget = this.widgets.find((candidate) => candidate.id === widgetId);
			if (!widget) throw new NotFoundError('Widget was not found', { widgetId });
			return widget;
		}
	};

	readonly diagramReader = {
		get: async (_actor: ActorContext, diagramId: DiagramId): Promise<Diagram> => {
			const diagram = this.diagrams.find((candidate) => candidate.id === diagramId);
			if (!diagram) throw new NotFoundError('Diagram was not found', { diagramId });
			return diagram;
		}
	};

	readonly attachmentReader = {
		get: async (_actor: ActorContext, attachmentId: AttachmentId): Promise<AttachmentView> => {
			const view = this.attachments.find((candidate) => candidate.attachment.id === attachmentId);
			if (!view) throw new NotFoundError('Attachment was not found', { attachmentId });
			return view;
		}
	};
}
