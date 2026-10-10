import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { LocalDate } from '$lib/models/workspace';
import type { Widget } from '$lib/models/widgets';
import { widgetReferencesIn } from '$lib/services/notes/references';
import type { WidgetSourceRecords } from '$lib/models/widgets';
import type { Lab } from '../../lab/application';

/**
 * Reads what a run left behind, through the controllers the app uses, so a verdict describes what
 * a person would open.
 */

export interface WidgetVerdict {
	readonly passed: boolean;
	readonly explanation: string;
}

/** Every widget the actor has, in every project. */
export async function savedWidgets(lab: Lab, actor: ActorContext): Promise<readonly Widget[]> {
	const { projects } = await lab.controllers.projects().list(actor);
	const lists = await Promise.all(
		projects.map((project) => lab.controllers.widgets().list(actor, { projectId: project.id }))
	);
	return lists.flatMap((result) => result.widgets);
}

/** The widget whose title matches, or why there is none. The newest wins when several match. */
export function widgetTitled(
	widgets: readonly Widget[],
	title: RegExp
):
	| { readonly kind: 'found'; readonly widget: Widget }
	| { readonly kind: 'failure'; readonly explanation: string } {
	const matching = widgets
		.filter((widget) => title.test(widget.title))
		.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
	const [widget] = matching;
	return widget
		? { kind: 'found', widget }
		: {
				kind: 'failure',
				explanation: `no widget titled like ${title}; found ${widgets.map((w) => `"${w.title}"`).join(', ') || 'none'}`
			};
}

/** Whether the note embeds the widget: the half of "add a widget to my note" a person sees first. */
export async function embedVerdict(
	lab: Lab,
	actor: ActorContext,
	noteId: NoteId,
	widget: Widget
): Promise<WidgetVerdict> {
	const { note } = await lab.controllers.notes().get(actor, { noteId });
	const embedded = widgetReferencesIn([note]).includes(widget.id);
	return {
		passed: embedded,
		explanation: embedded
			? `note "${note.title}" embeds widget "${widget.title}"`
			: // Text that names the widget without embedding it means the edit was made but the
				// embed line did not parse as a block, which is a different fault from no edit.
				`note "${note.title}" does not embed widget "${widget.title}"${
					note.plainText.includes(widget.id) ? ' (its id is in the text, not as an embed)' : ''
				}`
	};
}

/**
 * The records a widget's sources read, as the export reads them: the project's todos and notes,
 * with today as the server's UTC date.
 */
export async function sourceRecordsFor(
	lab: Lab,
	actor: ActorContext,
	widget: Widget
): Promise<WidgetSourceRecords> {
	const [{ todos }, shell] = await Promise.all([
		lab.controllers.todos().list(actor, { projectId: widget.projectId }),
		lab.controllers.workspace().getShellContext(actor)
	]);
	return {
		projectId: widget.projectId,
		today: new Date().toISOString().slice(0, 10) as LocalDate,
		todos: todos.map((view) => view.todo),
		notes: shell.noteTree
	};
}
