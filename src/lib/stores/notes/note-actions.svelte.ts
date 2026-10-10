import type { NoteActionSession } from '$lib/controllers/notes/actions';
export class NoteActionStore {
	private account = $state.raw<NoteActionSession | null>(null);
	private pendingReviews = $state(0);
	private error = $state<string | undefined>(undefined);
	private generation = 0;
	get binding(): NoteActionSession | null {
		return this.account;
	}
	get running(): boolean {
		return this.pendingReviews > 0;
	}
	get lastError(): string | undefined {
		return this.error;
	}
	reset(binding: NoteActionSession | null): void {
		this.generation += 1;
		this.account = binding;
		this.pendingReviews = 0;
		this.error = undefined;
	}
	begin(review: boolean): { generation: number; review: boolean } {
		this.error = undefined;
		if (review) this.pendingReviews += 1;
		return { generation: this.generation, review };
	}
	fail(generation: number, message: string): void {
		if (generation === this.generation) this.error = message;
	}
	finish(token: { generation: number; review: boolean }): void {
		if (token.generation === this.generation && token.review) this.pendingReviews -= 1;
	}
}
