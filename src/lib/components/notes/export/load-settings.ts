import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';

export const loadExportSettings = async (projectId: string): Promise<ExportSettings> => {
	const session = await workspaceSession.start();
	const result = await session.resources.lookup({
		type: 'export_settings',
		id: [session.bootstrap.accountId, projectId]
	});
	if (result.kind === 'absent' || result.kind === 'deleted') return { ...defaultExportSettings };
	if (result.kind !== 'ready')
		throw new Error(
			result.kind === 'failure'
				? result.message
				: 'Export defaults are not available on this device.'
		);
	if (result.value.type !== 'export_settings')
		throw new Error('The export defaults have the wrong resource type');
	return { ...defaultExportSettings, ...result.value.value.settings };
};
