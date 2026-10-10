import type { ProviderToolCall } from '$lib/models/agent';
/** Correlation and reasoning delivery for one provider execution. */
export class AgentStreamStore {
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
