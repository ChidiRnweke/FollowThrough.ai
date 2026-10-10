import type { WorkbenchLayoutRecord } from '$lib/models/workbench';
import type { WorkbenchLayoutRepository } from '$lib/controllers/workbench/contracts';

/** One account's durable layout, with controllable storage latency. */
export class InMemoryWorkbenchLayout implements WorkbenchLayoutRepository {
	record?: WorkbenchLayoutRecord;
	closed = false;
	readError?: Error;
	writeError?: Error;
	close(): void {
		this.closed = true;
	}
	readGate?: Promise<void>;
	writeGate?: Promise<void>;
	async get(): Promise<WorkbenchLayoutRecord | undefined> {
		if (this.closed) throw new Error('Workbench storage is closed');
		if (this.readError) throw this.readError;
		const snapshot = structuredClone(this.record);
		await this.readGate;
		return snapshot;
	}
	async put(record: WorkbenchLayoutRecord): Promise<void> {
		if (this.closed) throw new Error('Workbench storage is closed');
		if (this.writeError) throw this.writeError;
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
