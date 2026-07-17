import type { AgentRunEventRecord, AgentRunId, ConversationId } from '$lib/models';
import type { AgentRunTransport } from './contracts';

export class RemoteAgentRunTransport implements AgentRunTransport {
	async submit(input: Parameters<AgentRunTransport['submit']>[0]) {
		const { submitAgentRun } = await import('$lib/remote/chat.remote');
		return submitAgentRun(input as never);
	}

	async get(runId: AgentRunId) {
		const { getAgentRun } = await import('$lib/remote/chat.remote');
		return getAgentRun({ runId } as never);
	}

	async decide(input: Parameters<AgentRunTransport['decide']>[0]) {
		const { decideAgentRun } = await import('$lib/remote/chat.remote');
		return decideAgentRun(input as never);
	}

	async cancel(runId: AgentRunId) {
		const { cancelAgentRun } = await import('$lib/remote/chat.remote');
		return cancelAgentRun({ runId } as never);
	}

	async retry(runId: AgentRunId, requestId: string) {
		const { retryAgentRun } = await import('$lib/remote/chat.remote');
		return retryAgentRun({ runId, requestId } as never);
	}

	async getSession(conversationId: ConversationId) {
		const { getSession } = await import('$lib/remote/chat.remote');
		return getSession(conversationId);
	}

	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		const source = new EventSource(
			`/api/agent/runs/${input.runId}/events?after=${encodeURIComponent(input.after)}`
		);
		source.onopen = input.onOpen;
		source.addEventListener('agent', (event) => {
			const parsed = JSON.parse(event.data) as Omit<AgentRunEventRecord, 'createdAt'> & {
				createdAt: string;
			};
			input.onEvent({ ...parsed, createdAt: new Date(parsed.createdAt) });
		});
		source.onerror = input.onError;
		return { close: () => source.close() };
	}
}
