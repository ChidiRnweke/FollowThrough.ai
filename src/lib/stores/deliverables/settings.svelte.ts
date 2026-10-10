import type { DeliverableBinding } from '$lib/models/browser-deliverables';
import type { WorkspaceEditContext } from '$lib/models/workspace-editing';
export class ExportSettingsStore {
	private revision = 0;
	private loaded = $state.raw<DeliverableBinding | null>(null);
	private current = $state.raw<WorkspaceEditContext | null>(null);
	private working = $state(false);
	get generation(): number {
		return this.revision;
	}
	get binding(): DeliverableBinding | null {
		return this.loaded;
	}
	get draft(): WorkspaceEditContext | null {
		return this.current;
	}
	get busy(): boolean {
		return this.working;
	}
	bind(binding: DeliverableBinding): void {
		this.loaded = binding;
	}
	setDraft(draft: WorkspaceEditContext): void {
		this.current = draft;
	}
	setBusy(value: boolean): void {
		this.working = value;
	}
	clear(): void {
		this.revision++;
		this.loaded = null;
		this.current = null;
		this.working = false;
	}
}
