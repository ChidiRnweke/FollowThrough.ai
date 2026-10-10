import type { ChatContextEnvironment } from '$lib/controllers/agent/app-context';
import type { ChatWorkbenchFacts } from '$lib/models/chat';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';
import { workbench } from '$lib/stores/workbench/workbench.svelte';
import { chatKeyOf, noteIdOf, widgetIdOf } from '$lib/stores/workbench/tab-ref';
import type { WorkspaceSessionController } from '$lib/controllers/workspace/session';
export class BrowserChatContextEnvironment implements ChatContextEnvironment {
	constructor(private readonly workspace: WorkspaceSessionController) {}
	now(): Date {
		return new Date();
	}
	client(now: Date): AppContextSnapshotV1['client'] {
		return {
			locale: navigator.language,
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			localDate: now.toLocaleDateString('en-CA'),
			layout: matchMedia('(max-width: 767px)').matches ? 'compact' : 'wide'
		};
	}
	workbench(
		pathname: string,
		surface: AppContextSnapshotV1['surface']['kind']
	): ChatWorkbenchFacts {
		const inWorkbench =
			surface === 'note_workbench' || surface === 'diagram_editor' || workbench.isWorkbenchPath;
		const focused = inWorkbench
			? (workbench.interactionFocusedNoteId ?? workbench.focusedNoteId)
			: undefined;
		const widgetId =
			widgetIdOf(focused) ??
			(pathname.startsWith('/widgets/') ? pathname.split('/')[2] : undefined);
		return {
			isWorkbenchPath: workbench.isWorkbenchPath,
			interactionFocusedNoteId: workbench.interactionFocusedNoteId,
			focusedNoteId: workbench.focusedNoteId,
			splitNoteId: workbench.splitNoteId,
			openNotes: workbench.openTabs.flatMap((tab) => {
				const id = noteIdOf(tab);
				return id ? [id] : [];
			}),
			openChats: workbench.openTabs.flatMap((tab) => {
				const key = chatKeyOf(tab);
				return key ? [key] : [];
			}),
			focusedWidget: widgetId
				? (this.workspace.current?.resources.views.widget(widgetId) ?? undefined)
				: undefined
		};
	}
}
