import { syncEtag, type SyncSnapshot } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { UserId } from '$lib/models/identity';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { projectBuilder, testProjectId } from './domain-builders';
import { testWorkspaceAccount } from './workspace';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();

/** A project record as the server stores it, with its identity, key and versioned snapshots. */
export const replicaProject = (number: number, name = `Project ${number}`) => {
	const id = testProjectId(number);
	const value = projectBuilder({ id, userId: testWorkspaceAccount as UserId, name });
	const record: WorkspaceRecord = { type: 'projects', value };
	const identity = { type: 'projects' as const, id: [id] as [string] };
	return {
		id,
		record,
		identity,
		key: workspaceResourceKey(identity),
		/** The record as named at a server version. */
		at: (version: bigint, renamed = name): SyncSnapshot<WorkspaceRecord> => ({
			etag: syncEtag(version),
			value: { type: 'projects', value: { ...value, name: renamed } }
		})
	};
};
