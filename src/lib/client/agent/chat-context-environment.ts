import type { ChatContextEnvironment } from '$lib/controllers/agent/app-context';
import type { ChatWorkbenchFacts } from '$lib/models/chat';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';
import type { WorkbenchView } from '$lib/models/workbench';
import { chatKeyOf, noteIdOf, widgetIdOf } from '$lib/client/workbench/tab-ref';
import type { WorkspaceSessionController } from '$lib/controllers/workspace/session';
export class BrowserChatContextEnvironment implements ChatContextEnvironment {
	constructor(
		private readonly workspace: WorkspaceSessionController,
		private readonly view: WorkbenchView
	) {}
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
			surface === 'note_workbench' || surface === 'diagram_editor' || this.view.isWorkbenchPath;
		const focused = inWorkbench
			? (this.view.interactionFocusedNoteId ?? this.view.focusedNoteId)
			: undefined;
		const widgetId =
			widgetIdOf(focused) ??
			(pathname.startsWith('/widgets/') ? pathname.split('/')[2] : undefined);
		return {
			isWorkbenchPath: this.view.isWorkbenchPath,
			interactionFocusedNoteId: this.view.interactionFocusedNoteId,
			focusedNoteId: this.view.focusedNoteId,
			splitNoteId: this.view.splitNoteId,
			openNotes: this.view.openTabs.flatMap((tab) => {
				const id = noteIdOf(tab);
				return id ? [id] : [];
			}),
			openChats: this.view.openTabs.flatMap((tab) => {
				const key = chatKeyOf(tab);
				return key ? [key] : [];
			}),
			focusedWidget: widgetId
				? (this.workspace.current?.resources.views.widget(widgetId) ?? undefined)
				: undefined
		};
	}
}
