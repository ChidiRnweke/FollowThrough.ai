import type { DiagramSubmission, DiagramSubmissionDecision } from '$lib/models/diagrams/generation';
import type { DiagramGenerationEvent } from '$lib/server/controllers/diagrams/generation';
export type DiagramCompletion =
	| { readonly kind: 'completed'; readonly draft: DiagramSubmission }
	| { readonly kind: 'failure'; readonly error: Error };
interface PendingDecision {
	readonly resolve: (decision: DiagramSubmissionDecision) => void;
	readonly reject: (error: Error) => void;
}
/** One generation execution. Updates retain data; the controller invokes all continuations. */
export class DiagramGenerationStore {
	readonly abort = new AbortController();
	private readonly queue: DiagramGenerationEvent[] = [];
	private readonly decisions = new Map<string, PendingDecision>();
	private waiting: (() => void) | undefined;
	private outcome: { readonly kind: 'open' } | DiagramCompletion = { kind: 'open' };
	private execution:
		| {
				readonly completion: Promise<DiagramCompletion>;
				readonly events: AsyncIterable<DiagramGenerationEvent>;
		  }
		| undefined;
	get status() {
		return this.outcome;
	}
	get completion() {
		return this.execution?.completion;
	}
	get events() {
		return this.execution?.events;
	}
	start(
		execution: Promise<DiagramCompletion>,
		stream: AsyncIterable<DiagramGenerationEvent>
	): void {
		this.execution = { completion: execution, events: stream };
	}
	finish(completion: DiagramCompletion): void {
		this.outcome = completion;
	}
	enqueue(event: DiagramGenerationEvent): void {
		this.queue.push(event);
	}
	shift(): DiagramGenerationEvent | undefined {
		return this.queue.shift();
	}
	wait(wake: () => void): void {
		this.waiting = wake;
	}
	takeWake(): (() => void) | undefined {
		const wake = this.waiting;
		this.waiting = undefined;
		return wake;
	}
	addDecision(id: string, decision: PendingDecision): void {
		this.decisions.set(id, decision);
	}
	takeDecision(id: string): PendingDecision | undefined {
		const pending = this.decisions.get(id);
		this.decisions.delete(id);
		return pending;
	}
	takeDecisions(): readonly PendingDecision[] {
		const pending = [...this.decisions.values()];
		this.decisions.clear();
		return pending;
	}
}
