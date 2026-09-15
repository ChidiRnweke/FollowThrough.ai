import { submitAgentRunInputSchema, type AgentRunId } from '$lib/models/agent';
import { RunEventSubscription } from './subscription';
import type { AgentRunTransport } from './contracts';
import {
	cancelAgentRun,
	decideAgentRunBatch,
	getAgentRun,
	retryAgentRun,
	submitAgentRun
} from '$lib/remote/agent/chat.remote';

export class RemoteAgentRunTransport implements AgentRunTransport {
	async submit(input: Parameters<AgentRunTransport['submit']>[0]) {
		return submitAgentRun(submitAgentRunInputSchema.parse(input));
	}

	async get(runId: AgentRunId) {
		return getAgentRun({ runId });
	}

	async decideMany(input: Parameters<AgentRunTransport['decideMany']>[0]) {
		return decideAgentRunBatch({ ...input, callIds: [...input.callIds] });
	}

	async cancel(runId: AgentRunId) {
		return cancelAgentRun({ runId });
	}

	async retry(runId: AgentRunId, requestId: string) {
		return retryAgentRun({ runId, requestId });
	}

	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		return new RunEventSubscription(input);
	}
}
