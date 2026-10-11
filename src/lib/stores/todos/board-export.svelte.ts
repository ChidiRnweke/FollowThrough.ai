/** Export work belongs to the mounted board; closing it prevents late downloads. */
export class TodoBoardExportStore {
	private requests = $state(0);
	private stopped = $state(false);
	get busy(): boolean {
		return this.requests > 0;
	}
	get closed(): boolean {
		return this.stopped;
	}
	begin(): void {
		this.requests += 1;
	}
	finish(): void {
		this.requests -= 1;
	}
	close(): void {
		this.stopped = true;
	}
}
