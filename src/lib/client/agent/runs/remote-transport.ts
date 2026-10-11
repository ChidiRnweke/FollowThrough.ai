import { submitAgentRunInputSchema, type AgentRunId } from '$lib/models/agent';
import { RunEventSubscription } from './subscription';
import type { AgentRunTransport } from '$lib/controllers/agent/chat.svelte';
import { isHttpError } from '@sveltejs/kit';
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

	rejection(error: unknown): string | undefined {
		if (!isHttpError(error)) return undefined;
		const { status } = error;
		if (status < 400 || status >= 500) return undefined;
		// `App.Error` declares `message` required, so the body needs no probing once the
		// guard holds. A client-side schema failure is a `ZodError` with no status.
		return error.body.message.length > 0 ? error.body.message : 'That request was rejected.';
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
