import type { AppContextSnapshotV1, PaneContext } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { ChatContextFacts } from '$lib/models/chat';
function surfaceFor(pathname: string, params: URLSearchParams): AppContextSnapshotV1['surface'] {
	const filters: Record<string, string | number | boolean> = {};
	for (const key of ['status', 'responsibility', 'projectId', 'query', 'page']) {
		const value = params.get(key);
		if (value !== null)
			filters[key] = key === 'page' && /^\d+$/.test(value) ? Number(value) : value;
	}
	const parts = pathname.split('/').filter(Boolean);
	// The studio is a pair of workbench tabs, not a route: it runs at
	// `/chats/new?focus=chat:…&split=draft:…` as often as at `/diagrams/<id>`.
	// Reading it off the tab params is what makes the agent aware of the canvas
	// wherever the user opened it, rather than on one URL shape.
	const hasCanvasTab = ['tabs', 'focus', 'split'].some((key) =>
		/(?:^|,)(?:diagram|draft):/.test(params.get(key) ?? '')
	);
	let kind: AppContextSnapshotV1['surface']['kind'] = 'unknown';
	// Decided first, and it wins outright: a canvas tab is open, whatever route
	// the user reached it by. Asking last meant the ladder below assigned a kind
	// that was then thrown away.
	const focusedWidget =
		/^widget:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			(params.get('focus') ?? '').trim()
		);
	if (hasCanvasTab) kind = 'diagram_studio';
	else if (focusedWidget || parts[0] === 'widgets') kind = 'widget';
	else if (parts[0] === 'today') kind = 'today';
	else if (parts[0] === 'todos') kind = 'todos';
	else if (parts[0] === 'notes' && parts[2] === 'diagrams') kind = 'diagram_editor';
	else if (parts[0] === 'diagrams') kind = parts.length > 1 ? 'diagram_studio' : 'diagrams';
	else if (parts[0] === 'notes') kind = 'note_workbench';
	else if (parts[0] === 'projects' && parts[2] === 'todos') kind = 'project_todos';
	else if (parts[0] === 'projects' && parts[2] === 'memory') kind = 'project_memory';
	else if (parts[0] === 'projects' && parts[2] === 'attachments') kind = 'project_attachments';
	else if (parts[0] === 'projects') kind = 'project';
	else if (parts[0] === 'artifacts') kind = 'artifacts';
	else if (parts[0] === 'chats') kind = parts.length > 1 ? 'chat' : 'chats';
	else if (parts[0] === 'skills') kind = parts.length > 1 ? 'skill' : 'skills';
	else if (parts[0] === 'profile') kind = 'profile';
	else if (parts[0] === 'settings') kind = 'settings';
	return {
		kind,
		presentation: parts[0] === 'chats' ? 'full_page' : 'right_panel',
		...(Object.keys(filters).length ? { filters } : {})
	};
}

export interface ChatContextPresentation {
	surface(pathname: string, params: URLSearchParams): AppContextSnapshotV1['surface'];
	capture(facts: ChatContextFacts): AppContextSnapshotV1;
}
export class ChatContextPresentationService implements ChatContextPresentation {
	surface(pathname: string, params: URLSearchParams): AppContextSnapshotV1['surface'] {
		return surfaceFor(pathname, params);
	}
	capture(facts: ChatContextFacts): AppContextSnapshotV1 {
		const { workbench } = facts;
		const surface = surfaceFor(facts.pathname, new URLSearchParams(facts.search));
		// Derived from the workbench itself, not the surface kind: a focused chat
		// tab puts the URL on `/chats/*`, whose surface is `chat`, and gating on
		// the kind would drop the whole workbench block — silently starving the
		// agent of the open tabs it is being asked about.
		const inWorkbench =
			surface.kind === 'note_workbench' ||
			surface.kind === 'diagram_editor' ||
			workbench.isWorkbenchPath;
		const focusedNoteId = inWorkbench
			? (workbench.interactionFocusedNoteId ?? workbench.focusedNoteId)
			: undefined;
		const visibleIds = [workbench.focusedNoteId, workbench.splitNoteId]
			.filter((id): id is NoteId => Boolean(id))
			.slice(0, 2);
		const visiblePanes = visibleIds
			.map((id) => facts.panes.get(id))
			.filter((pane): pane is PaneContext => Boolean(pane));
		const openTabs = workbench.openNotes.flatMap((noteId) => {
			const note = facts.shell?.noteTree.find((entry) => entry.id === noteId);
			return note ? [{ id: note.id, title: note.title, projectId: note.projectId }] : [];
		});
		const openChatTabs = workbench.openChats.flatMap((sessionKey) => {
			const reported = facts.chatPanes.get(sessionKey);
			return [
				{
					sessionKey,
					title: reported?.title ?? 'New chat',
					...(reported?.conversationId ? { conversationId: reported.conversationId } : {})
				}
			];
		});
		const focusedNote = facts.shell?.noteTree.find((entry) => entry.id === focusedNoteId);
		// A widget tab, or the widget page, tells the agent which widget `read_widget` should open.
		const focusedWidget = workbench.focusedWidget;
		const pathProjectId = facts.pathname.startsWith('/projects/')
			? (facts.pathname.split('/')[2] as ProjectId | undefined)
			: undefined;
		const projectId = focusedNote?.projectId ?? focusedWidget?.projectId ?? pathProjectId;
		const project = facts.shell?.projects.find((entry) => entry.id === projectId);
		return {
			version: 1,
			capturedAt: facts.capturedAt,
			client: facts.client,
			surface,
			...(project ? { currentProject: { id: project.id, name: project.name } } : {}),
			...(focusedNote
				? {
						activeResource: {
							kind: 'note' as const,
							id: focusedNote.id,
							title: focusedNote.title,
							projectId: focusedNote.projectId
						}
					}
				: focusedWidget
					? {
							activeResource: {
								kind: 'widget' as const,
								id: focusedWidget.id,
								title: focusedWidget.title,
								projectId: focusedWidget.projectId
							}
						}
					: project
						? { activeResource: { kind: 'project' as const, id: project.id, title: project.name } }
						: {}),
			...(inWorkbench && (openTabs.length || openChatTabs.length)
				? {
						workbench: {
							openTabs,
							visiblePanes,
							...(openChatTabs.length ? { openChatTabs } : {}),
							...(focusedNoteId ? { focusedNoteId } : {}),
							...(visibleIds.length === 2
								? { otherVisibleNoteId: visibleIds.find((id) => id !== focusedNoteId) }
								: {})
						}
					}
				: {}),
			recentInteractions: facts.interactions.slice(0, 5)
		};
	}
}
