import { describe, expect, it } from 'vitest';
import { AgentProviderFailure } from '$lib/models/agent';
import type { AgentExecutionUpdate, AgentRun, AgentRunId, ConversationId } from '$lib/models/agent';
import type { ProvenanceId } from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentRunLifecycle } from './lifecycle';

const testRunId = '30000000-0000-4000-8000-000000000001' as AgentRunId;
const testConversationId = '30000000-0000-4000-8000-0000000000c1' as ConversationId;
const testTime = '2026-01-01T00:00:00.000Z' as DateTime;

/**
 * Stands in for a provider stream the user stops: it hangs until the signal
 * fires, and `started` lets a test wait for the run to actually be `running`
 * before asking to cancel it.
 */
const abortingRunner = () => {
	let entered: () => void;
	const started = new Promise<void>((resolve) => (entered = resolve));
	return {
		started,
		execute: async function* (input: { readonly signal: AbortSignal }) {
			entered();
			await new Promise<void>((resolve) => {
				if (input.signal.aborted) return resolve();
				input.signal.addEventListener('abort', () => resolve(), { once: true });
			});
			throw new Error('The operation was aborted');
			yield undefined as never;
		}
	};
};

const throwingRunner = (error: unknown) => ({
	// eslint-disable-next-line require-yield
	execute: async function* () {
		throw error;
	}
});

const setup = <T extends { execute: (input: never) => AsyncIterable<AgentExecutionUpdate> }>(
	runner: T
) => {
	const runs = new InMemoryAgentRunPersistence();
	const sessions = new InMemoryAgentSessionRepository();
	const notified: AgentRunId[] = [];
	const run: AgentRun = {
		id: testRunId,
		userId: testActor().userId,
		conversationId: testConversationId,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: '30000000-0000-4000-8000-0000000000r1',
		pendingDecisions: [],
		provenanceId: testProvenanceId() as ProvenanceId,
		contextSnapshot: { seeded: true },
		inputSnapshot: { input: 'Do the thing' },
		definitionVersion: 2,
		createdAt: testTime,
		updatedAt: testTime
	};
	runs.runs.push(run);
	const lifecycle = new AgentRunLifecycle({
		runs,
		events: runs,
		decisions: runs,
		sessions,
		transactions: new InMemoryTransactionRunner([runs, sessions]),
		contextBuilder: { build: async () => ({ seeded: true }) },
		provenance: {
			record: async () => {
				throw new Error('Unexpected provenance record');
			}
		},
		conversations: {
			recordToolActivity: async () => undefined,
			recordAssistantText: async () => undefined
		},
		runner: runner as never,
		eventBus: { notify: (runId) => notified.push(runId) }
	});
	return { lifecycle, runs, notified, runner };
};

/** Runs a turn to the point where the provider is streaming, then stops it. */
const stopMidStream = async () => {
	const context = setup(abortingRunner());
	const controller = new AbortController();
	const execution = context.lifecycle.execute(testRunId, controller.signal);
	await context.runner.started;
	await requestCancellation(context.runs);
	controller.abort();
	return { ...context, outcome: await execution };
};

/** Drives a run to `cancelling` the way the controller does before aborting. */
const requestCancellation = async (runs: InMemoryAgentRunPersistence) =>
	runs.requestCancellation(testActor(), testRunId, testTime);

const currentRun = (runs: InMemoryAgentRunPersistence) =>
	runs.runs.find((run) => run.id === testRunId)!;

describe('stopping a running agent run', () => {
	it('settles the run as cancelled', async () => {
		const { runs } = await stopMidStream();
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('appends a cancelled event for the client stream', async () => {
		const { runs } = await stopMidStream();
		expect(runs.events.some((record) => record.event.type === 'cancelled')).toBe(true);
	});

	it('reports the cancelled outcome to the caller', async () => {
		const { outcome } = await stopMidStream();
		expect(outcome).toBe('cancelled');
	});

	it('records when the run finished', async () => {
		const { runs } = await stopMidStream();
		expect(currentRun(runs).finishedAt).toBeDefined();
	});

	it('notifies subscribers so the open stream closes', async () => {
		const { notified } = await stopMidStream();
		expect(notified.filter((runId) => runId === testRunId).length).toBeGreaterThan(1);
	});
});

describe('finishing a cancellation out of band', () => {
	it('settles a run parked in cancelling', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await runs.transition(testRunId, 'queued', 'running');
		await requestCancellation(runs);
		await lifecycle.finishCancellation(testRunId);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a run that already settled alone', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await runs.transition(testRunId, 'queued', 'running');
		await runs.transition(testRunId, 'running', 'completed');
		await lifecycle.finishCancellation(testRunId);
		expect(currentRun(runs).status).toBe('completed');
	});

	it('appends no orphan event for a run that already settled', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await runs.transition(testRunId, 'queued', 'running');
		await runs.transition(testRunId, 'running', 'completed');
		await lifecycle.finishCancellation(testRunId);
		expect(runs.events.some((record) => record.event.type === 'cancelled')).toBe(false);
	});
});

describe('settling a run whose execution threw', () => {
	/** Drives a turn to the point the controller's rejection handler sees. */
	const crash = async (error: unknown) => {
		const context = setup(throwingRunner(error));
		await context.lifecycle.execute(testRunId, new AbortController().signal).catch(() => undefined);
		await context.lifecycle.failRun(testRunId, error);
		return context;
	};

	it('rethrows so the caller can settle the run', async () => {
		const { lifecycle } = setup(throwingRunner(new Error('Provider exploded')));
		await expect(lifecycle.execute(testRunId, new AbortController().signal)).rejects.toThrow(
			'Provider exploded'
		);
	});

	it('marks the run failed', async () => {
		const { runs } = await crash(new Error('Provider exploded'));
		expect(currentRun(runs).status).toBe('failed');
	});

	it('records the provider error code', async () => {
		const { runs } = await crash(
			new AgentProviderFailure('Provider exploded', 'EXTERNAL_SERVICE', false)
		);
		expect(currentRun(runs).providerErrorCode).toBe('EXTERNAL_SERVICE');
	});

	it('appends a failed event the client will not wait on', async () => {
		const { runs } = await crash(new Error('Something unexpected'));
		expect(runs.events.some((record) => record.event.type === 'failed')).toBe(true);
	});

	it('cancels rather than fails a run the user asked to stop', async () => {
		const error = new Error('Stream ended oddly');
		const { lifecycle, runs } = setup(throwingRunner(error));
		await runs.transition(testRunId, 'queued', 'running');
		await requestCancellation(runs);
		await lifecycle.failRun(testRunId, error);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a run that already completed alone', async () => {
		const error = new Error('Late failure');
		const { lifecycle, runs } = setup(throwingRunner(error));
		await runs.transition(testRunId, 'queued', 'running');
		await runs.transition(testRunId, 'running', 'completed');
		await lifecycle.failRun(testRunId, error);
		expect(currentRun(runs).status).toBe('completed');
	});
});
