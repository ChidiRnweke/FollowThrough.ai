import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceViewState } from '$lib/models/workspace-views';
import { SvelteMap } from 'svelte/reactivity';
/** Account-scoped normalized records and their mechanical type index. No filtering decisions. */
export interface WorkspaceProjectionStateAccess {
	readonly records: ReadonlyMap<string, WorkspaceRecord>;
	readonly byType: ReadonlyMap<WorkspaceRecord['type'], readonly WorkspaceRecord[]>;
	replace(records: ReadonlyMap<string, WorkspaceRecord>): void;
}
export class WorkspaceProjectionStore
	implements WorkspaceProjectionStateAccess, WorkspaceViewState
{
	private current = $state.raw<ReadonlyMap<string, WorkspaceRecord>>(new SvelteMap());
	private index = $state.raw<ReadonlyMap<WorkspaceRecord['type'], readonly WorkspaceRecord[]>>(
		new SvelteMap()
	);
	constructor(records: ReadonlyMap<string, WorkspaceRecord>) {
		this.replace(records);
	}
	get records(): ReadonlyMap<string, WorkspaceRecord> {
		return this.current;
	}
	get byType(): ReadonlyMap<WorkspaceRecord['type'], readonly WorkspaceRecord[]> {
		return this.index;
	}
	replace(records: ReadonlyMap<string, WorkspaceRecord>): void {
		const index = new SvelteMap<WorkspaceRecord['type'], WorkspaceRecord[]>();
		for (const record of records.values()) {
			const bucket = index.get(record.type);
			if (bucket) bucket.push(record);
			else index.set(record.type, [record]);
		}
		this.current = records;
		this.index = index;
	}
}
