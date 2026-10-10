import type { ProviderStreamEvent } from '$lib/models/agent';
import type { DiagramSubmissionDecision } from '$lib/models/diagrams/generation';
import type { DiagramGenerationEvent, DiagramCompletion } from '$lib/models/diagrams/generation';
interface PendingDecision {
	readonly resolve: (decision: DiagramSubmissionDecision) => void;
	readonly reject: (error: Error) => void;
}
/** One generation execution. Updates retain data; the controller invokes all continuations. */
export interface DiagramGenerationState {
	readonly abort: AbortController;
	readonly status: { readonly kind: 'open' } | DiagramCompletion;
	finish(completion: DiagramCompletion): void;
	enqueue(event: DiagramGenerationEvent<ProviderStreamEvent>): void;
	shift(): DiagramGenerationEvent<ProviderStreamEvent> | undefined;
	wait(wake: () => void): void;
	takeWake(): (() => void) | undefined;
	addDecision(id: string, decision: PendingDecision): void;
	takeDecision(id: string): PendingDecision | undefined;
	takeDecisions(): readonly PendingDecision[];
}
export class DiagramGenerationStore implements DiagramGenerationState {
	readonly abort = new AbortController();
	private readonly queue: DiagramGenerationEvent<ProviderStreamEvent>[] = [];
	private readonly decisions = new Map<string, PendingDecision>();
	private waiting: (() => void) | undefined;
	private outcome: { readonly kind: 'open' } | DiagramCompletion = { kind: 'open' };
	get status() {
		return this.outcome;
	}
	finish(completion: DiagramCompletion): void {
		this.outcome = completion;
	}
	enqueue(event: DiagramGenerationEvent<ProviderStreamEvent>): void {
		this.queue.push(event);
	}
	shift(): DiagramGenerationEvent<ProviderStreamEvent> | undefined {
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
