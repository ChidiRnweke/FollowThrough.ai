export interface EditorSessionState {
	readonly edited: number;
	readonly persisted: number;
	readonly epoch: number;
	readonly closed: boolean;
	readonly failure: string | null;
	readonly saving: boolean;
}
/** One editor lifetime; controllers own persistence and generation decisions. */
export class EditorSessionStore {
	private current = $state<EditorSessionState>({
		edited: 0,
		persisted: 0,
		epoch: 0,
		closed: false,
		failure: null,
		saving: false
	});
	private pending: Promise<void> | null = null;
	read(): EditorSessionState {
		return this.current;
	}
	update(changes: Partial<EditorSessionState>): void {
		this.current = { ...this.current, ...changes };
	}
	get flight(): Promise<void> | null {
		return this.pending;
	}
	setFlight(pending: Promise<void> | null): void {
		this.pending = pending;
	}
}
