import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources';
import type { WorkspaceSession } from '$lib/controllers/workspace/session';
export interface ExportSettingsBinding {
	readonly session: WorkspaceSession;
	readonly draft: WorkspaceDraftController<'export_settings'>;
}
export class ExportSettingsStore {
	private revision = 0;
	private loaded = $state.raw<ExportSettingsBinding | null>(null);
	private working = $state(false);
	get generation(): number {
		return this.revision;
	}
	get binding(): ExportSettingsBinding | null {
		return this.loaded;
	}
	get busy(): boolean {
		return this.working;
	}
	bind(binding: ExportSettingsBinding): void {
		this.loaded = binding;
	}
	setBusy(value: boolean): void {
		this.working = value;
	}
	clear(): void {
		this.revision += 1;
		this.loaded = null;
		this.working = false;
	}
}
