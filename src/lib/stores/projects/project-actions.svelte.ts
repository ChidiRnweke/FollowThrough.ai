import type { ProjectActionSession } from '$lib/controllers/projects/actions';
/** Account-bound status only; controllers own every action and error decision. */
export class ProjectActionStore {
	private pending = $state(0);
	private error = $state<string | undefined>(undefined);
	private account = $state.raw<ProjectActionSession | null>(null);
	private generation = 0;
	private identity = $state<string | null>(null);
	get accountId(): string | null {
		return this.identity;
	}
	get binding(): ProjectActionSession | null {
		return this.account;
	}
	get busy(): boolean {
		return this.pending > 0;
	}
	get lastError(): string | undefined {
		return this.error;
	}
	reset(session: ProjectActionSession | null, accountId: string | null): void {
		this.identity = accountId;
		this.generation += 1;
		this.account = session;
		this.pending = 0;
		this.error = undefined;
	}
	begin(): number {
		this.pending += 1;
		this.error = undefined;
		return this.generation;
	}
	fail(generation: number, message: string): void {
		if (generation === this.generation) this.error = message;
	}
	finish(generation: number): void {
		if (generation === this.generation) this.pending -= 1;
	}
}
