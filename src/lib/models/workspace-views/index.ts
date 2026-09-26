import type { WorkspaceValues } from '$lib/models/workspace-records';

export type WorkspaceSkill = WorkspaceValues['skills'] & {
	readonly note: WorkspaceValues['notes'];
};
