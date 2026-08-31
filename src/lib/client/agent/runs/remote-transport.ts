import {
	readAgentRunEventRecord,
	submitAgentRunInputSchema,
	type AgentRunId,
	type ConversationId
} from '$lib/models/agent';
import type { AgentRunTransport } from './contracts';
import {
	cancelAgentRun,
	decideAgentRunBatch,
	getAgentRun,
	getSession,
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

	async getSession(conversationId: ConversationId) {
		return getSession(conversationId);
	}

	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		const source = new EventSource(
			`/api/agent/runs/${input.runId}/events?after=${encodeURIComponent(input.after)}`
		);
		source.onopen = input.onOpen;
		source.addEventListener('agent', (event) => {
			// The server serialized a record it had already parsed, but what arrives
			// here is text off a socket and nothing between the two is checked. A
			// frame this client cannot read is dropped rather than delivered as a
			// record the store would then have to guess at.
			const frame: unknown = JSON.parse(event.data);
			const record = readAgentRunEventRecord(frame);
			if (record.kind === 'readable') input.onEvent(record);
			else console.warn(`[agent] dropped an unreadable event frame: ${record.reason}`);
		});
		source.onerror = input.onError;
		return { close: () => source.close() };
	}
}
