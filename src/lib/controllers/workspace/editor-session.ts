import type { EditorSave } from '$lib/models/outbox';
import type { EditorSessionStore } from '$lib/stores/workspace/editor-session.svelte';
export interface EditorSessionController {
	readonly failure: string | null;
	readonly saving: boolean;
	readonly dirty: boolean;
	readonly generation: number;
	changed(): void;
	checkpoint(): () => boolean;
	accept(apply?: () => void): void;
	close(): void;
	save<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void>;
}
/** Serializes persistence while preserving edits made during an earlier save. */
export class EditorSessions implements EditorSessionController {
	constructor(
		private readonly active: () => boolean,
		private readonly state: EditorSessionStore
	) {}
	get failure(): string | null {
		return this.state.read().failure;
	}
	get saving(): boolean {
		return this.state.read().saving;
	}
	get dirty(): boolean {
		return this.state.read().edited !== this.state.read().persisted;
	}
	get generation(): number {
		return this.state.read().edited;
	}
	changed(): void {
		this.state.update({ edited: this.state.read().edited + 1, failure: null });
	}
	checkpoint(): () => boolean {
		const { edited, epoch } = this.state.read();
		return () =>
			!this.state.read().closed &&
			this.active() &&
			edited === this.state.read().edited &&
			epoch === this.state.read().epoch;
	}
	accept(apply: () => void = () => undefined): void {
		const current = this.state.read();
		if (current.closed || !this.active()) return;
		this.state.update({
			epoch: current.epoch + 1,
			edited: current.edited + 1,
			persisted: current.edited + 1,
			failure: null
		});
		apply();
	}
	close(): void {
		this.state.update({ closed: true, epoch: this.state.read().epoch + 1 });
	}
	save<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		const flight = this.state.flight;
		if (flight)
			return flight.then(() => {
				if (this.dirty && !this.failure && !this.state.read().closed && this.active())
					return this.save(persist, apply);
			});
		const pending = this.flush(persist, apply).finally(() => {
			this.state.setFlight(null);
			this.state.update({ saving: false });
		});
		this.state.setFlight(pending);
		return pending;
	}
	private async flush<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		this.state.update({ saving: true });
		const epoch = this.state.read().epoch;
		while (
			this.dirty &&
			!this.state.read().closed &&
			this.active() &&
			epoch === this.state.read().epoch
		) {
			const generation = this.state.read().edited;
			const result = await persist().catch((error): EditorSave<T> => {
				return {
					kind: 'failure',
					message: error instanceof Error ? error.message : 'The edit could not be saved'
				};
			});
			if (this.state.read().closed || !this.active() || epoch !== this.state.read().epoch) return;
			if (result.kind === 'failure') {
				this.state.update({ failure: result.message });
				return;
			}
			this.state.update({ persisted: generation, failure: null });
			apply(result.value, generation === this.state.read().edited);
		}
	}
}
