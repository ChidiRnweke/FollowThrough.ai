/** Per-user in-flight requests and recent completion times. */
export interface InlineAdmissionState {
	hasRequest(userId: string): boolean;
	recent(userId: string): readonly number[];
	register(userId: string): void;
	release(userId: string): void;
	replaceRecent(userId: string, timestamps: readonly number[]): void;
}

/** Per-user process state. Timing and admission decisions belong to the rule/controller. */
export class InlineAdmissionStore implements InlineAdmissionState {
	private readonly inFlight = new Set<string>();
	private readonly timestamps = new Map<string, readonly number[]>();
	hasRequest(userId: string): boolean {
		return this.inFlight.has(userId);
	}
	recent(userId: string): readonly number[] {
		return this.timestamps.get(userId) ?? [];
	}
	register(userId: string): void {
		this.inFlight.add(userId);
	}
	release(userId: string): void {
		this.inFlight.delete(userId);
	}
	replaceRecent(userId: string, timestamps: readonly number[]): void {
		this.timestamps.set(userId, timestamps);
	}
}
