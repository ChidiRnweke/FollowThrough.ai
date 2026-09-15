export type EditorSave<T> = { kind: 'saved'; value: T } | { kind: 'failure'; message: string };

/** A pane's buffer lifecycle. The draft remains the owner of versions and durable writes. */
export class EditorSession {
	private edited = $state(0);
	private persisted = $state(0);
	private epoch = 0;
	private closed = false;
	private flight: Promise<void> | null = null;
	failure = $state<string | null>(null);
	saving = $state(false);
	constructor(private readonly active: () => boolean) {}
	get dirty(): boolean {
		return this.edited !== this.persisted;
	}
	get generation(): number {
		return this.edited;
	}
	changed(): void {
		this.edited++;
		this.failure = null;
	}
	checkpoint(): () => boolean {
		const edited = this.edited;
		const epoch = this.epoch;
		return () => !this.closed && this.active() && edited === this.edited && epoch === this.epoch;
	}
	accept(apply: () => void = () => undefined): void {
		if (this.closed || !this.active()) return;
		this.epoch++;
		this.edited++;
		this.persisted = this.edited;
		this.failure = null;
		apply();
	}
	close(): void {
		this.closed = true;
		this.epoch++;
	}
	save<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		if (this.flight)
			return this.flight.then(() => {
				if (this.dirty && !this.failure && !this.closed && this.active())
					return this.save(persist, apply);
			});
		this.flight ??= this.flush(persist, apply).finally(() => {
			this.flight = null;
			this.saving = false;
		});
		return this.flight;
	}
	private async flush<T>(
		persist: () => Promise<EditorSave<T>>,
		apply: (value: T, unchanged: boolean) => void
	): Promise<void> {
		this.saving = true;
		const epoch = this.epoch;
		while (this.dirty && !this.closed && this.active() && epoch === this.epoch) {
			const generation = this.edited;
			const result = await persist().catch((error): EditorSave<T> => {
				return {
					kind: 'failure',
					message: error instanceof Error ? error.message : 'The edit could not be saved'
				};
			});
			if (this.closed || !this.active() || epoch !== this.epoch) return;
			if (result.kind === 'failure') {
				this.failure = result.message;
				return;
			}
			this.persisted = generation;
			this.failure = null;
			apply(result.value, generation === this.edited);
		}
	}
}
