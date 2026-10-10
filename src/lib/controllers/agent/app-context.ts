import type { ShellContext } from '$lib/models/workspace-views';
import type { AppContextSnapshotV1, PaneContext, SemanticInteraction } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { ChatPaneReport, ChatWorkbenchFacts } from '$lib/models/chat';
import type { AppContextState } from '$lib/stores/agent/app-context';
import type { ChatContextPresentation } from '$lib/services/chat/app-context';
type PaneGetter = () => PaneContext | undefined;
type ChatPaneGetter = () => ChatPaneReport;
export interface ChatContextEnvironment {
	now(): Date;
	client(now: Date): AppContextSnapshotV1['client'];
	workbench(pathname: string, surface: AppContextSnapshotV1['surface']['kind']): ChatWorkbenchFacts;
}
export interface AppContextController {
	configure(shell: ShellContext, url: URL): void;
	registerPane(noteId: NoteId, getter: PaneGetter): () => void;
	registerChatPane(sessionKey: string, getter: ChatPaneGetter): () => void;
	recordFocus(noteId: NoteId): void;
	capture(): AppContextSnapshotV1;
	clear(): void;
}
export class AppContext implements AppContextController {
	constructor(
		private readonly state: AppContextState,
		private readonly environment: ChatContextEnvironment,
		private readonly presentation: ChatContextPresentation
	) {}
	configure(shell: ShellContext, url: URL): void {
		this.state.shell = shell;
		this.state.pathname = url.pathname;
		this.state.search = url.search;
	}

	registerPane(noteId: NoteId, getter: PaneGetter): () => void {
		this.state.panes.set(noteId, getter);
		return () => {
			if (this.state.panes.get(noteId) === getter) this.state.panes.delete(noteId);
		};
	}

	registerChatPane(sessionKey: string, getter: ChatPaneGetter): () => void {
		this.state.chatPanes.set(sessionKey, getter);
		return () => {
			if (this.state.chatPanes.get(sessionKey) === getter) this.state.chatPanes.delete(sessionKey);
		};
	}

	recordFocus(noteId: NoteId): void {
		const interaction: SemanticInteraction = {
			kind: 'focus',
			resourceKind: 'note',
			resourceId: noteId,
			occurredAt: this.environment.now().toISOString()
		};
		this.state.interactions = [interaction, ...this.state.interactions].slice(0, 5);
	}

	capture(): AppContextSnapshotV1 {
		const now = this.environment.now();
		const panes = new Map<NoteId, PaneContext>();
		for (const [id, read] of this.state.panes) {
			const pane = read();
			if (pane) panes.set(id, pane);
		}
		const chatPanes = new Map<string, ChatPaneReport>();
		for (const [key, read] of this.state.chatPanes) chatPanes.set(key, read());
		return this.presentation.capture({
			shell: this.state.shell,
			pathname: this.state.pathname,
			search: this.state.search,
			workbench: this.environment.workbench(
				this.state.pathname,
				this.presentation.surface(this.state.pathname, new URLSearchParams(this.state.search)).kind
			),
			panes,
			chatPanes,
			interactions: this.state.interactions,
			capturedAt: now.toISOString(),
			client: this.environment.client(now)
		});
	}
	clear(): void {
		this.state.shell = undefined;
		this.state.panes.clear();
		this.state.chatPanes.clear();
		this.state.interactions = [];
		this.state.pathname = '/';
		this.state.search = '';
	}
}
