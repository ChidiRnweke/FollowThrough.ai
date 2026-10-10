import type { NoteActionBinding, NoteActionToken } from '$lib/models/browser-workspace';
export interface NoteActionState {
	readonly binding: NoteActionBinding | undefined;
	readonly running: boolean;
	readonly lastError: string | undefined;
	reset(binding: NoteActionBinding): void;
	begin(review: boolean): NoteActionToken;
	fail(token: NoteActionToken, message: string): void;
	finish(token: NoteActionToken): void;
}
export class NoteActionStore implements NoteActionState {
	private account = $state.raw<NoteActionBinding | undefined>(undefined);
	private reviews = $state<readonly number[]>([]);
	private error = $state<string | undefined>(undefined);
	private generation = 0;
	private nextId = 0;
	private latest = 0;
	get binding(): NoteActionBinding | undefined {
		return this.account;
	}
	get running(): boolean {
		return this.reviews.length > 0;
	}
	get lastError(): string | undefined {
		return this.error;
	}
	reset(binding: NoteActionBinding): void {
		this.generation += 1;
		this.account = binding;
		this.reviews = [];
		this.error = undefined;
	}
	begin(review: boolean): NoteActionToken {
		const id = ++this.nextId;
		this.latest = id;
		this.error = undefined;
		if (review) this.reviews = [...this.reviews, id];
		return { id, generation: this.generation, review };
	}
	fail(token: NoteActionToken, message: string): void {
		if (token.generation === this.generation && token.id === this.latest) this.error = message;
	}
	finish(token: NoteActionToken): void {
		if (token.generation === this.generation && token.review)
			this.reviews = this.reviews.filter((id) => id !== token.id);
	}
}
