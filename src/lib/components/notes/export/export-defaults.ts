import { workspaceSession } from '$lib/factories/workspace/session';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';

export type ExportDefaults =
	| { readonly kind: 'ready'; readonly settings: ExportSettings }
	| { readonly kind: 'failure'; readonly message: string };

/** A project's saved export layout over the app defaults; none saved reads as the defaults. */
export const loadExportDefaults = async (projectId: string): Promise<ExportDefaults> => {
	const accountId = (await workspaceSession.start()).bootstrap.accountId;
	const found = await workspaceSession.find(
		{ type: 'export_settings', id: [accountId, projectId] },
		'export setting'
	);
	if (found.kind === 'failure') return found;
	return {
		kind: 'ready',
		settings: {
			...defaultExportSettings,
			...(found.kind === 'ready' ? found.value.settings : {})
		}
	};
};
