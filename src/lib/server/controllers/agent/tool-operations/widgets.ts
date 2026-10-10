import type {
	AgentToolInput,
	AgentWidgetCreationInput,
	AgentWidgetDataEditInput,
	AgentWidgetLayoutEditInput
} from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import { type WidgetId } from '$lib/models/widgets';
import type { WidgetsController } from '$lib/server/controllers/widgets/controller';
import type { AgentProjectChoice } from '../project-choice';
import type { AgentToolOutput } from '../tool-outputs';
interface WidgetsToolOperationsDependencies {
	widgets(): Pick<WidgetsController, 'catalog' | 'create' | 'list' | 'get' | 'edit'>;
}
export interface WidgetsToolOperations {
	read_widget_catalog(): Promise<AgentToolOutput<'read_widget_catalog'>>;
	create_widget(input: AgentWidgetCreationInput): Promise<AgentToolOutput<'create_widget'>>;
	list_widgets(input: AgentToolInput<'list_widgets'>): Promise<AgentToolOutput<'list_widgets'>>;
	read_widget(input: AgentToolInput<'read_widget'>): Promise<AgentToolOutput<'read_widget'>>;
	edit_widget_data(input: AgentWidgetDataEditInput): Promise<AgentToolOutput<'edit_widget_data'>>;
	edit_widget_layout(
		input: AgentWidgetLayoutEditInput
	): Promise<AgentToolOutput<'edit_widget_layout'>>;
}
export class WidgetsToolOperationsController implements WidgetsToolOperations {
	constructor(
		private readonly controllers: WidgetsToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly projectChoice: AgentProjectChoice
	) {}
	async read_widget_catalog(): Promise<AgentToolOutput<'read_widget_catalog'>> {
		return this.controllers.widgets().catalog(this.actor);
	}
	async create_widget(input: AgentWidgetCreationInput): Promise<AgentToolOutput<'create_widget'>> {
		const chosenProjectId =
			input.projectId ?? (await this.projectChoice.requireChoice(this.actor, 'create a widget'));
		if (input.draft.kind === 'failure') throw input.draft.error;
		const { widget } = await this.controllers.widgets().create(this.actor, {
			id: crypto.randomUUID() as WidgetId,
			projectId: chosenProjectId,
			draft: input.draft.draft
		});
		// Single quotes parse the same as double ones, and need no escaping inside the JSON
		// arguments of the edit_note call that inserts the line. An unescaped double quote
		// there fails the whole run as malformed tool arguments.
		const embed = `:::widgetNode {widgetId='${widget.id}'} :::`;
		// Creating saves the widget in the project; only a reviewed note edit shows it in a
		// note (ADR 0003), so the result names that edit rather than performing it.
		return {
			widgetId: widget.id,
			title: widget.title,
			embed,
			nextActions: [
				input.noteId
					? {
							tool: 'edit_note' as const,
							noteId: input.noteId,
							reason: `The widget is not in the note yet. Call edit_note on note ${input.noteId} now and insert ${embed} on its own line where the user asked for it.`
						}
					: {
							tool: 'edit_note' as const,
							reason:
								'If the user asked for the widget in a note, insert the embed line on its own line in that note before you finish.'
						}
			]
		};
	}
	async list_widgets(
		input: AgentToolInput<'list_widgets'>
	): Promise<AgentToolOutput<'list_widgets'>> {
		const chosenProjectId =
			input.projectId ?? (await this.projectChoice.requireChoice(this.actor, 'list widgets'));
		const { widgets } = await this.controllers
			.widgets()
			.list(this.actor, { projectId: chosenProjectId });
		return {
			widgets: widgets.map((widget) => ({
				widgetId: widget.id,
				title: widget.title,
				updatedAt: widget.updatedAt
			}))
		};
	}
	async read_widget(input: AgentToolInput<'read_widget'>): Promise<AgentToolOutput<'read_widget'>> {
		return this.controllers.widgets().get(this.actor, input);
	}
	async edit_widget_data(
		input: AgentWidgetDataEditInput
	): Promise<AgentToolOutput<'edit_widget_data'>> {
		return this.controllers.widgets().edit(this.actor, {
			widgetId: input.widgetId,
			edit: {
				kind: 'data',
				expectedDataRevision: input.expectedDataRevision,
				patch: input.patch
			}
		});
	}
	async edit_widget_layout(
		input: AgentWidgetLayoutEditInput
	): Promise<AgentToolOutput<'edit_widget_layout'>> {
		return this.controllers.widgets().edit(this.actor, {
			widgetId: input.widgetId,
			edit: {
				kind: 'layout',
				expectedLayoutRevision: input.expectedLayoutRevision,
				patch: input.patch
			}
		});
	}
}
