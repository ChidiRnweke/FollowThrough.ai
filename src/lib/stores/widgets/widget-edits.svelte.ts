import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import {
	widgetTemplates,
	type WidgetChange,
	type WidgetId,
	type WidgetTemplateName
} from '$lib/models/widgets';
import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import { workspaceSession } from '$lib/factories/workspace/session';
import { toast } from 'svelte-sonner';

/** What became of an edit handed to the workspace: staged in the outbox, or refused. */
export type WidgetEditOutcome =
	{ readonly kind: 'staged' } | { readonly kind: 'failure'; readonly message: string };

/**
 * Widget writes go through the workspace queue like every other record (ADR 0040). Every
 * surface that shows a widget stages its edits here, so a note embed and the widget tab write
 * the same command the same way.
 */
class WidgetEdits {
	editor(widgetId: WidgetId): WorkspaceDraftController<'widgets'> {
		const session = workspaceSession.current;
		if (!session) throw new Error('Open the workspace before opening a widget');
		return session.resources.draft({ type: 'widgets', id: [widgetId] });
	}

	async stage(
		editor: WorkspaceDraftController<'widgets'>,
		widgetId: WidgetId,
		change: WidgetChange
	): Promise<WidgetEditOutcome> {
		const result = await editor.stage({ kind: 'editWidget', widgetId, change });
		return result.kind === 'saved' ? { kind: 'staged' } : result;
	}

	/** Move a widget to or from the trash, or delete it from the trash, through the queue. */
	async changeTrash(
		widgetId: WidgetId,
		action: 'archive' | 'restore' | 'delete'
	): Promise<WidgetEditOutcome> {
		const editor = this.editor(widgetId);
		editor.capture();
		const kind =
			action === 'archive'
				? 'archiveWidget'
				: action === 'restore'
					? 'restoreWidget'
					: 'deleteWidget';
		const result = await editor.stage({ kind, widgetId });
		if (result.kind === 'saved') return { kind: 'staged' };
		toast.error(result.message);
		return result;
	}

	/** Create a widget from a template and return its id, for the caller to embed. */
	async createFromTemplate(input: {
		readonly template: WidgetTemplateName;
		readonly projectId: ProjectId;
		/** Absent for a widget started in the gallery rather than in a note. */
		readonly sourceNoteId?: NoteId;
	}): Promise<WidgetId> {
		const session = await workspaceSession.start();
		const id = crypto.randomUUID() as WidgetId;
		await session.resources.create({
			kind: 'createWidget',
			id,
			projectId: input.projectId,
			...(input.sourceNoteId ? { sourceNoteId: input.sourceNoteId } : {}),
			draft: widgetTemplates[input.template]
		});
		return id;
	}
}

export const widgetEdits = new WidgetEdits();
