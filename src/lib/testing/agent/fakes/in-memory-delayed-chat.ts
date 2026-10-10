import { submitAgentRunInputSchema } from '$lib/models/agent';
import type { AgentRunReceipt, AgentRunSnapshot, SubmitAgentRunInput } from '$lib/models/agent';
import { InMemoryRunTransport } from './in-memory-run-transport';
export class InMemoryDelayedChatTransport extends InMemoryRunTransport {
	readonly submission = Promise.withResolvers<AgentRunReceipt>();
	readonly decision = Promise.withResolvers<AgentRunSnapshot>();
	readonly reconciliation = Promise.withResolvers<AgentRunSnapshot>();
	deferSubmit = true;
	override async submit(input: SubmitAgentRunInput): Promise<AgentRunReceipt> {
		this.requests.set(input.requestId, submitAgentRunInputSchema.parse(input));
		return this.deferSubmit ? this.submission.promise : this.receipt;
	}
	override async decideMany(): Promise<AgentRunSnapshot> {
		return this.decision.promise;
	}
	override async get(): Promise<AgentRunSnapshot> {
		return this.reconciliation.promise;
	}
}
