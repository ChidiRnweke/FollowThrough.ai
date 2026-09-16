import type { WorkbenchLayoutRecord } from '$lib/models/workbench';
import type { WorkspaceRepository } from '$lib/stores/workbench/workbench.svelte';

/** One account's durable layout, with controllable storage latency. */
export class InMemoryWorkbenchLayout implements WorkspaceRepository {
	record?: WorkbenchLayoutRecord;
	readGate?: Promise<void>;
	writeGate?: Promise<void>;
	async get(): Promise<WorkbenchLayoutRecord | undefined> {
		const snapshot = structuredClone(this.record);
		await this.readGate;
		return snapshot;
	}
	async put(record: WorkbenchLayoutRecord): Promise<void> {
		const snapshot = {
			...record,
			openTabs: [...record.openTabs],
			pinnedTabs: [...record.pinnedTabs],
			recentlyUsed: [...record.recentlyUsed]
		};
		await this.writeGate;
		this.record = snapshot;
	}
}
