import {
	ProjectExportSettings,
	type ProjectExportSettingsController
} from '$lib/controllers/deliverables/settings';
import { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
import { workspaceSession } from '$lib/factories/workspace/session';
export const createProjectExportSettings = (): ProjectExportSettingsController =>
	new ProjectExportSettings(new ExportSettingsStore(), workspaceSession);
