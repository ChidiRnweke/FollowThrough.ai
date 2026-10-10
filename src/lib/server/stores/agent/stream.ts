import type { ProviderToolCall } from '$lib/models/agent';
/** Correlation and reasoning delivery for one provider execution. */
export interface AgentStreamState {
	readonly activeCalls: ReadonlyMap<string, ProviderToolCall>;
	readonly streamed: boolean;
	remember(id: string, call: ProviderToolCall): void;
	forget(id: string): void;
	setStreamed(value: boolean): void;
}
export class AgentStreamStore implements AgentStreamState {
	private readonly calls = new Map<string, ProviderToolCall>();
	private reasoningDelivered = false;
	get activeCalls(): ReadonlyMap<string, ProviderToolCall> {
		return this.calls;
	}
	get streamed(): boolean {
		return this.reasoningDelivered;
	}
	remember(id: string, call: ProviderToolCall): void {
		this.calls.set(id, call);
	}
	forget(id: string): void {
		this.calls.delete(id);
	}
	setStreamed(value: boolean): void {
		this.reasoningDelivered = value;
	}
}
