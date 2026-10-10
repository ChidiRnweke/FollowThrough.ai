import type { ShellContext } from '$lib/models/workspace-views';
import type { PaneContext, SemanticInteraction } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { ChatPaneReport } from '$lib/models/chat';
type PaneGetter = () => PaneContext | undefined;
type ChatPaneGetter = () => ChatPaneReport;
export class AppContextState {
	shell?: ShellContext;
	pathname = '/';
	search = '';
	panes = new Map<NoteId, PaneGetter>();
	/**
	 * Keyed by chat session. Registered by the pane rather than read from the
	 * chat registry, because the chat stores already import this module — asking
	 * them for their titles here would close that loop.
	 */
	chatPanes = new Map<string, ChatPaneGetter>();
	interactions: SemanticInteraction[] = [];
}
