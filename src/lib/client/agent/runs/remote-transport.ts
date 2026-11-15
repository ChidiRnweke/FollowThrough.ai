import {
	submitAgentRunInputSchema,
	type AgentRunId,
	type AgentRunReceipt
} from '$lib/models/agent';
import { RunEventSubscription } from './subscription';
import type { AgentRunSubmission, AgentRunTransport } from '$lib/controllers/agent/chat.svelte';
import { isHttpError } from '@sveltejs/kit';
import {
	cancelAgentRun,
	decideAgentRunBatch,
	getAgentRun,
	retryAgentRun,
	submitAgentRun
} from '$lib/remote/agent/chat.remote';

export class RemoteAgentRunTransport implements AgentRunTransport {
	submit(input: Parameters<AgentRunTransport['submit']>[0]): Promise<AgentRunSubmission> {
		return this.decided(() => submitAgentRun(submitAgentRunInputSchema.parse(input)));
	}

	private async decided(request: () => Promise<AgentRunReceipt>): Promise<AgentRunSubmission> {
		try {
			return { kind: 'accepted', receipt: await request() };
		} catch (error) {
			const message = this.rejection(error);
			if (message === undefined) throw error;
			return { kind: 'refused', message };
		}
	}

	private rejection(error: unknown): string | undefined {
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

	retry(runId: AgentRunId, requestId: string): Promise<AgentRunSubmission> {
		return this.decided(() => retryAgentRun({ runId, requestId }));
	}

	openEvents(input: Parameters<AgentRunTransport['openEvents']>[0]) {
		return new RunEventSubscription(input);
	}
}
