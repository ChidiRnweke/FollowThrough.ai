import type {
	AppContextSnapshotV1,
	NoteId,
	PaneContext,
	ProjectId,
	SemanticInteraction,
	ShellContext,
	TextSelection
} from '$lib/models';
import { editorSelectionRegistry } from './registries/editor-selection-registry.svelte';
import { workbench } from './workbench.svelte';

export function surfaceFor(
	pathname: string,
	params: URLSearchParams
): AppContextSnapshotV1['surface'] {
	const filters: Record<string, string | number | boolean> = {};
	for (const key of ['status', 'responsibility', 'projectId', 'query', 'page']) {
		const value = params.get(key);
		if (value !== null)
			filters[key] = key === 'page' && /^\d+$/.test(value) ? Number(value) : value;
	}
	const parts = pathname.split('/').filter(Boolean);
	let kind: AppContextSnapshotV1['surface']['kind'] = 'unknown';
	if (pathname === '/') kind = 'today';
	else if (parts[0] === 'todos') kind = 'todos';
	else if (parts[0] === 'notes' && parts[2] === 'diagrams') kind = 'diagram_editor';
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

type PaneGetter = () => PaneContext | undefined;

class AppContextStore {
	private shell?: ShellContext;
	private pathname = '/';
	private search = '';
	private panes = new Map<NoteId, PaneGetter>();
	private interactions: SemanticInteraction[] = [];

	configure(shell: ShellContext, url: URL): void {
		this.shell = shell;
		this.pathname = url.pathname;
		this.search = url.search;
	}

	registerPane(noteId: NoteId, getter: PaneGetter): () => void {
		this.panes.set(noteId, getter);
		return () => this.panes.delete(noteId);
	}

	recordFocus(noteId: NoteId): void {
		const interaction: SemanticInteraction = {
			kind: 'focus',
			resourceKind: 'note',
			resourceId: noteId,
			occurredAt: new Date().toISOString()
		};
		this.interactions = [interaction, ...this.interactions].slice(0, 5);
	}

	capture(): AppContextSnapshotV1 {
		const now = new Date();
		const surface = surfaceFor(this.pathname, new URLSearchParams(this.search));
		const inWorkbench = surface.kind === 'note_workbench' || surface.kind === 'diagram_editor';
		const focusedNoteId = inWorkbench
			? (workbench.interactionFocusedNoteId ?? workbench.focusedNoteId)
			: undefined;
		const visibleIds = [workbench.focusedNoteId, workbench.splitNoteId]
			.filter((id): id is NoteId => Boolean(id))
			.slice(0, 2);
		const visiblePanes = visibleIds
			.map((id) => this.panes.get(id)?.())
			.filter((pane): pane is PaneContext => Boolean(pane));
		const openTabs = workbench.openTabs.slice(0, 20).flatMap((noteId) => {
			const note = this.shell?.noteTree.find((entry) => entry.id === noteId);
			return note ? [{ id: note.id, title: note.title, projectId: note.projectId }] : [];
		});
		const focusedNote = this.shell?.noteTree.find((entry) => entry.id === focusedNoteId);
		const pathProjectId = this.pathname.startsWith('/projects/')
			? (this.pathname.split('/')[2] as ProjectId | undefined)
			: undefined;
		const projectId = focusedNote?.projectId ?? pathProjectId;
		const project = this.shell?.projects.find((entry) => entry.id === projectId);
		const selection: TextSelection | undefined = focusedNoteId
			? editorSelectionRegistry.peek(focusedNoteId)?.current
			: undefined;
		const clippedSelection = selection
			? { ...selection, text: selection.text.slice(0, 12000) }
			: undefined;
		return {
			version: 1,
			capturedAt: now.toISOString(),
			client: {
				locale: navigator.language,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				localDate: now.toLocaleDateString('en-CA'),
				layout: matchMedia('(max-width: 767px)').matches ? 'compact' : 'wide'
			},
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
				: project
					? { activeResource: { kind: 'project' as const, id: project.id, title: project.name } }
					: {}),
			...(inWorkbench && openTabs.length
				? {
						workbench: {
							openTabs,
							visiblePanes,
							...(focusedNoteId ? { focusedNoteId } : {}),
							...(visibleIds.length === 2
								? { otherVisibleNoteId: visibleIds.find((id) => id !== focusedNoteId) }
								: {})
						}
					}
				: {}),
			...(clippedSelection ? { selection: clippedSelection } : {}),
			recentInteractions: this.interactions.slice(0, 5)
		};
	}
}

export const appContext = new AppContextStore();
