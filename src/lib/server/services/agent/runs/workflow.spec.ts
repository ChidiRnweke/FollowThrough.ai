import { describe, expect, it } from 'vitest';
import type { ActorContext } from '$lib/models/identity';
import type { AgentRunId, AgentEvent, Conversation, ConversationId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import { WorkflowRunner, type WorkflowRunTask } from './workflow';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const actor = testActor();
	const runs = new InMemoryAgentRunPersistence();
	const created: Conversation[] = [];
	const activeRuns = {
		controllers: new Map<AgentRunId, AbortController>(),
		register: (runId: AgentRunId) => {
			const controller = new AbortController();
			activeRuns.controllers.set(runId, controller);
			return controller;
		},
		release: (runId: AgentRunId) => activeRuns.controllers.delete(runId),
		abort: (runId: AgentRunId) => activeRuns.controllers.get(runId)?.abort()
	};
	const runner = new WorkflowRunner({
		runs,
		events: runs,
		conversations: {
			createWorkflow: async (
				ctx: ActorContext,
				input: { title: string; contextNoteId?: NoteId }
			): Promise<Conversation> => {
				const conversation: Conversation = {
					id: `conversation-${created.length + 1}` as ConversationId,
					userId: ctx.userId,
					kind: 'workflow',
					contextNoteId: input.contextNoteId,
					title: input.title,
					createdAt: testNow,
					updatedAt: testNow
				};
				created.push(conversation);
				return conversation;
			}
		},
		eventBus: { notify: () => undefined },
		activeRuns,
		defaultModel: 'openrouter:test-model'
	});
	return { actor, runs, created, activeRuns, runner };
};

const task = (run: WorkflowRunTask<unknown>['run']): WorkflowRunTask<unknown> => ({
	action: 'diagram',
	noteId: testNoteId(),
	title: 'Convert diagram',
	run
});

/** `start` runs the work in the background; wait for it to settle into a terminal state. */
const settle = async (
	runs: InMemoryAgentRunPersistence,
	runId: AgentRunId
): Promise<ReturnType<InMemoryAgentRunPersistence['findById']>> => {
	for (let i = 0; i < 40; i += 1) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		const run = runs.runs.find((item) => item.id === runId);
		if (run && run.status !== 'running') return run;
	}
	return runs.runs.find((item) => item.id === runId);
};

const resultOf = (events: readonly { event: AgentEvent }[], type: AgentEvent['type']): unknown =>
	events.find((record) => record.event.type === type)?.event;

describe('WorkflowRunner', () => {
	it('returns the queued event cursor as the receipt cursor', async () => {
		const { actor, runner, runs } = setup();
		const receipt = await runner.start(
			actor,
			task(async () => 'ok')
		);

		expect(receipt.latestCursor).toBe(runs.events[0]?.cursor);
	});

	it('creates a workflow conversation named by the task for its note', async () => {
		const { actor, runner, created } = setup();
		await runner.start(
			actor,
			task(async () => 'ok')
		);

		expect(created[0]).toMatchObject({
			kind: 'workflow',
			title: 'Convert diagram',
			contextNoteId: testNoteId()
		});
	});

	it('inserts the run in auto-accept mode against the workflow conversation', async () => {
		const { actor, runner, runs, created } = setup();
		await runner.start(
			actor,
			task(async () => 'ok')
		);
		const run = runs.runs[0];

		expect({
			executionMode: run.executionMode,
			conversationId: run.conversationId,
			contextSnapshot: run.contextSnapshot
		}).toEqual({
			executionMode: 'auto_accept',
			conversationId: created[0]?.id,
			contextSnapshot: { action: 'diagram', noteId: testNoteId() }
		});
	});

	it('settles a successful task as completed with its result in the log', async () => {
		const { actor, runner, runs } = setup();
		const receipt = await runner.start(
			actor,
			task(async () => ({ ok: true }))
		);
		await settle(runs, receipt.runId);

		const settled = runs.runs.find((item) => item.id === receipt.runId);
		expect({
			status: settled?.status,
			result: (resultOf(runs.events, 'workflow_result') as { result?: unknown })?.result
		}).toEqual({ status: 'completed', result: { ok: true } });
	});

	it('closes a successful run with a completed event for its conversation', async () => {
		const { actor, runner, runs, created } = setup();
		const receipt = await runner.start(
			actor,
			task(async () => 'ok')
		);
		await settle(runs, receipt.runId);

		expect(
			(resultOf(runs.events, 'completed') as { conversationId?: ConversationId }).conversationId
		).toBe(created[0]?.id);
	});

	it('settles a failing task as failed with its message', async () => {
		const { actor, runner, runs } = setup();
		const receipt = await runner.start(
			actor,
			task(async () => {
				throw new Error('boom');
			})
		);
		await settle(runs, receipt.runId);

		const settled = runs.runs.find((item) => item.id === receipt.runId);
		expect({
			status: settled?.status,
			message: (resultOf(runs.events, 'failed') as { message?: string })?.message
		}).toEqual({ status: 'failed', message: 'boom' });
	});

	it('settles an aborted run as cancelled', async () => {
		const { actor, runner, runs, activeRuns } = setup();
		const receipt = await runner.start(actor, {
			action: 'diagram',
			noteId: testNoteId(),
			title: 'Convert diagram',
			run: (signal) =>
				new Promise<never>((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
				})
		});
		await runs.transition(receipt.runId, 'running', 'cancelling');
		activeRuns.abort(receipt.runId);
		await settle(runs, receipt.runId);

		expect(runs.runs.find((item) => item.id === receipt.runId)?.status).toBe('cancelled');
	});
});
