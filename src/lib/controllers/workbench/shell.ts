import type { ProjectId } from '$lib/models/projects';
import type { TabId } from '$lib/models/workbench';
import type { ShellContext } from '$lib/models/workspace-views';
import type { WorkspaceViewsController } from '$lib/controllers/workspace/views';
import type {
	WorkbenchLayoutLifecycle,
	WorkbenchPruning,
	WorkbenchConversations,
	WorkbenchTabReader
} from './contracts';
interface WorkbenchWorkspace {
	readonly shell: Pick<ShellContext, 'noteTree'>;
	readonly resources: {
		readonly availability: 'complete' | 'unknown';
		readonly views: Pick<WorkspaceViewsController, 'diagram' | 'widget'>;
	};
}
export interface WorkbenchShellController {
	start(accountId: string, conversations: WorkbenchConversations): () => void;
	reconcile(workspace: WorkbenchWorkspace): Promise<void>;
}
/** Coordinates the shell's complete workbench lifecycle and inventory changes. */
export class WorkbenchShell implements WorkbenchShellController {
	constructor(
		private readonly layout: WorkbenchLayoutLifecycle,
		private readonly navigation: WorkbenchPruning,
		private readonly tabs: WorkbenchTabReader
	) {}
	start(accountId: string, conversations: WorkbenchConversations): () => void {
		const detach = this.layout.attach(accountId, conversations);
		void this.layout.hydrate();
		return detach;
	}
	async reconcile(workspace: WorkbenchWorkspace): Promise<void> {
		this.layout.syncFromUrl();
		this.layout.refreshActiveProjectId((id) => this.projectOfTab(workspace, id));
		if (workspace.resources.availability !== 'complete') return;
		// Partial inventory is never evidence that a tab's record was deleted.
		const known = new Set(
			workspace.shell.noteTree.filter((entry) => !entry.archivedAt).map((entry) => entry.id)
		);
		await this.navigation.pruneClosedNotes(known);
	}
	private projectOfTab(workspace: WorkbenchWorkspace, id: TabId): ProjectId | undefined {
		const ref = this.tabs.ref(id);
		if (ref?.kind === 'diagram') return workspace.resources.views.diagram(ref.diagramId)?.projectId;
		if (ref?.kind === 'widget') return workspace.resources.views.widget(ref.widgetId)?.projectId;
		if (ref?.kind === 'note')
			return workspace.shell.noteTree.find((entry) => entry.id === ref.noteId)?.projectId;
		return undefined;
	}
}
