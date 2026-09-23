import { isTerminalAgentRunStatus } from '$lib/services/agent/run-status';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type PendingAgentDecision } from '$lib/models/agent';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import type { AgentRunId, ConversationId, RunAgentInput } from '$lib/models/agent';
import type { DateTime } from '$lib/models/workspace';
import { assistantItem, userItem } from '$lib/testing/agent/session-items';
import {
	appContextBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const activeFixtures: ReturnType<typeof agentSubmissionFixture>[] = [];
const setup = (phase: Parameters<typeof agentSubmissionFixture>[0] = 'queued') => {
	const fixture = agentSubmissionFixture(phase);
	activeFixtures.push(fixture);
	return fixture;
};
afterEach(async () => {
	for (const fixture of activeFixtures.splice(0)) {
		for (const run of fixture.runs.runs)
			await fixture.controller.cancel({ userId: run.userId }, run.id);
		fixture.release();
		await vi.waitFor(() => {
			if (fixture.runs.runs.some((run) => !isTerminalAgentRunStatus(run.status)))
				throw new Error('Run did not settle after fixture cleanup');
		});
	}
});

const awaitingApproval = async (pendingDecisions: readonly PendingAgentDecision[]) => {
	const fixture = setup('approval');
	fixture.runner.outcome = {
		type: 'approval_checkpoint',
		serializedState: 'provider-checkpoint',
		sessionItems: [],
		pendingDecisions: [...pendingDecisions]
	};
	const receipt = await fixture.controller.submit(testActor(), {
		requestId: crypto.randomUUID(),
		input: 'Review these changes'
	});
	await vi.waitFor(() => {
		if (fixture.runs.runs[0]?.status !== 'awaiting_approval')
			throw new Error('Approval not parked');
	});
	fixture.pauseExecution();
	return { ...fixture, receipt };
};

describe('durable agent submission', () => {
	it('records queued cancellation once when the request is repeated', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: crypto.randomUUID(),
			input: 'Wait for cancellation'
		});
		await controller.cancel(testActor(), receipt.runId);
		await controller.cancel(testActor(), receipt.runId);
		expect(runs.events.filter((record) => record.event.type === 'cancelled')).toHaveLength(1);
	});
	it('returns a queued receipt before provider execution', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000001',
			input: 'Help me decide',
			model: 'openai/test-model'
		});
		expect(receipt.status).toBe('queued');
	});

	// The run's own record of itself has to name its conversation. It used not to
	// when the client had no id to send — which is every chat's first message —
	// and any tool reading the snapshot for it got an empty string. That reached
	// the database as `where id = ''` and failed the whole turn.
	it('names the conversation in the snapshot when the request carried no id', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-00000000000a',
			input: 'Draw me the ingest pipeline'
		});
		expect(runs.runs.find((run) => run.id === receipt.runId)?.inputSnapshot?.conversationId).toBe(
			receipt.conversationId
		);
	});

	it('keeps the conversation the request named', async () => {
		const { controller, runs, conversations } = setup();
		const existing = '20000000-0000-4000-8000-00000000000b' as ConversationId;
		await conversations.insert(testActor(), {
			id: existing,
			userId: testActor().userId,
			kind: 'chat',
			createdAt: '2026-01-01T00:00:00.000Z' as DateTime,
			updatedAt: '2026-01-01T00:00:00.000Z' as DateTime
		} as Parameters<typeof conversations.insert>[1]);
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-00000000000c',
			conversationId: existing,
			input: 'Carry on'
		});
		expect(runs.runs.find((run) => run.id === receipt.runId)?.inputSnapshot?.conversationId).toBe(
			existing
		);
	});

	it('records the user prompt against the persisted run', async () => {
		const { controller, conversations } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000009',
			input: 'Help me decide'
		});
		expect(conversations.messages.find((message) => message.role === 'user')?.runId).toBe(
			receipt.runId
		);
	});

	it('records one prompt for a duplicate logical request', async () => {
		const { controller, conversations } = setup();
		const input = {
			requestId: '10000000-0000-4000-8000-000000000002',
			input: 'Compare the options'
		};
		await controller.submit(testActor(), input);
		await controller.submit(testActor(), input);
		expect(conversations.messages.filter((message) => message.role === 'user')).toHaveLength(1);
	});

	it('returns the same run for a duplicate logical request', async () => {
		const { controller } = setup();
		const input = {
			requestId: '10000000-0000-4000-8000-000000000003',
			input: 'Compare the options'
		};
		const first = await controller.submit(testActor(), input);
		const second = await controller.submit(testActor(), input);
		expect(second.runId).toBe(first.runId);
	});

	it('rejects another active run in the same conversation', async () => {
		const { controller } = setup();
		const first = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000004',
			input: 'First'
		});
		await expect(
			controller.submit(testActor(), {
				requestId: '10000000-0000-4000-8000-000000000005',
				conversationId: first.conversationId,
				input: 'Second'
			})
		).rejects.toThrow('active agent run');
	});
});

describe('scope staged before the user moved screens', () => {
	/** Staged on project 2; by send time the user is looking at project 1. */
	const moved = async () => {
		const context = setup();
		await context.controller.submit(testActor(), {
			requestId: '30000000-0000-4000-8000-000000000001',
			input: 'Summarise this',
			projectId: testProjectId(2),
			noteId: testNoteId(2),
			appContext: appContextBuilder({
				currentProject: { id: testProjectId(), name: 'Project Alpha' }
			})
		});
		return context.runs.runs.at(-1)?.inputSnapshot as RunAgentInput | undefined;
	};

	it('scopes the run to the screen the user is actually on', async () => {
		expect((await moved())?.projectId).toBe(testProjectId());
	});

	it('carries the staged project through for the agent to reconcile', async () => {
		expect((await moved())?.requestedScope?.projectId).toBe(testProjectId(2));
	});

	it('leaves the staged scope out when nothing was overridden', async () => {
		const { controller, runs } = setup();
		await controller.submit(testActor(), {
			requestId: '30000000-0000-4000-8000-000000000002',
			input: 'Summarise this',
			projectId: testProjectId(),
			appContext: appContextBuilder()
		});
		expect(runs.runs.at(-1)?.inputSnapshot).not.toHaveProperty('requestedScope');
	});
});

describe('skills a studio run needs', () => {
	const submitted = async (kind: 'diagram_studio' | 'chat') => {
		const context = setup();
		await context.controller.submit(testActor(), {
			requestId: '30000000-0000-4000-8000-000000000003',
			input: 'Draw the ingestion pipeline',
			appContext: appContextBuilder({ surface: { kind, presentation: 'full_page' } })
		});
		return context.runs.runs.at(-1)?.inputSnapshot as RunAgentInput | undefined;
	};

	it('requests the Diagramming skill when a canvas is open', async () => {
		expect((await submitted('diagram_studio'))?.requestedSkillNames).toEqual(['Diagramming']);
	});

	it('leaves an ordinary chat run without it', async () => {
		expect(await submitted('chat').then((input) => input?.requestedSkillNames)).toBeUndefined();
	});
});

describe('resubmitting an edited question', () => {
	/** A conversation with one answered question and no run in flight. */
	const settled = async (input: { requestId: string; input: string }) => {
		const context = setup();
		const receipt = await context.controller.submit(testActor(), input);
		await land(context);
		return { ...context, receipt };
	};

	/** Rewinding refuses to touch a live conversation, so land its runs first. */
	const land = async (context: ReturnType<typeof agentSubmissionFixture>): Promise<void> => {
		context.release();
		await vi.waitFor(() => {
			if (context.runs.runs.some((run) => run.status !== 'completed'))
				throw new Error('Run has not completed');
		});
		context.pauseExecution();
	};

	it('replaces the discarded question in the transcript', async () => {
		const { controller, conversations, receipt } = await settled({
			requestId: '20000000-0000-4000-8000-000000000001',
			input: 'Summarise this'
		});
		await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-000000000002',
			conversationId: receipt.conversationId,
			input: 'Summarise this in one line',
			retryUserOrdinal: 1
		});
		expect(conversations.messages.map((message) => message.content.text)).toEqual([
			'Summarise this in one line'
		]);
	});

	it('rewinds provider session memory to before the discarded question', async () => {
		const { controller, sessions, receipt } = await settled({
			requestId: '20000000-0000-4000-8000-000000000003',
			input: 'Summarise this'
		});
		await sessions.append(testActor(), receipt.conversationId, [
			userItem('Summarise this'),
			assistantItem('Here you go')
		]);
		await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-000000000004',
			conversationId: receipt.conversationId,
			input: 'Summarise this in one line',
			retryUserOrdinal: 1
		});
		expect(await sessions.list(testActor(), receipt.conversationId)).toHaveLength(0);
	});

	it('leaves earlier turns in place', async () => {
		const context = await settled({
			requestId: '20000000-0000-4000-8000-000000000005',
			input: 'First'
		});
		const { controller, conversations, receipt } = context;
		await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-000000000006',
			conversationId: receipt.conversationId,
			input: 'Second'
		});
		await land(context);
		await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-000000000007',
			conversationId: receipt.conversationId,
			input: 'Second, rephrased',
			retryUserOrdinal: 2
		});
		expect(conversations.messages.map((message) => message.content.text)).toEqual([
			'First',
			'Second, rephrased'
		]);
	});

	it('refuses to rewind a conversation with a run in flight', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-000000000008',
			input: 'First'
		});
		await expect(
			controller.submit(testActor(), {
				requestId: '20000000-0000-4000-8000-000000000009',
				conversationId: receipt.conversationId,
				input: 'Edited',
				retryUserOrdinal: 1
			})
		).rejects.toThrow('Wait for the current agent run to finish');
	});

	it('keeps the rewind out of the frozen input, so retrying the run cannot rewind again', async () => {
		const { controller, runs, receipt } = await settled({
			requestId: '20000000-0000-4000-8000-00000000000a',
			input: 'Summarise this'
		});
		await controller.submit(testActor(), {
			requestId: '20000000-0000-4000-8000-00000000000b',
			conversationId: receipt.conversationId,
			input: 'Summarise this in one line',
			retryUserOrdinal: 1
		});
		expect(runs.runs.at(-1)?.inputSnapshot).not.toHaveProperty('retryUserOrdinal');
	});
});

describe('durable agent lifecycle commands', () => {
	it('does not let another actor cancel a queued run', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: crypto.randomUUID(),
			input: 'Private request'
		});
		await expect(controller.cancel(testActor(2), receipt.runId)).rejects.toThrow('not found');
	});

	it('rolls back queued cancellation when its event cannot be stored', async () => {
		const { controller, runs } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: crypto.randomUUID(),
			input: 'Cancel atomically'
		});
		runs.failedEvent = 'cancelled';
		try {
			await controller.cancel(testActor(), receipt.runId).catch((error: Error) => {
				if (error.message !== 'Event storage unavailable') throw error;
				return { kind: 'failure' as const };
			});
			expect(runs.runs.find((run) => run.id === receipt.runId)?.status).toBe('queued');
		} finally {
			runs.failedEvent = undefined;
		}
	});

	it('cancels a queued run immediately', async () => {
		const { controller } = setup();
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000006',
			input: 'Stop before start'
		});
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect(snapshot.run.status).toBe('cancelled');
	});

	it('aborts the in-flight execution of a running run', async () => {
		const { controller, runner } = setup('running');
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-00000000000c',
			input: 'Stop mid-stream'
		});
		await runner.started.promise;
		await controller.cancel(testActor(), receipt.runId);
		expect(runner.signals.at(-1)?.aborted).toBe(true);
	});

	it('marks a running run as cancelling while the executor settles it', async () => {
		const { controller, runner } = setup('running');
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-00000000000d',
			input: 'Stop mid-stream'
		});
		await runner.started.promise;
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect(snapshot.run.status).toBe('cancelling');
	});

	it('cancels a run parked on an approval with nothing left to abort', async () => {
		const { controller, runs } = setup('approval');
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-00000000000e',
			input: 'Park then stop'
		});
		await vi.waitFor(() => {
			if (runs.runs[0]?.status !== 'awaiting_approval') throw new Error('Approval not parked');
		});
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect(snapshot.run.status).toBe('cancelled');
	});

	it('returns no pending approval cards after cancelling a parked run', async () => {
		const { controller, receipt } = await awaitingApproval([
			{ callId: 'call-cleared', toolName: 'archive_note', arguments: { noteId: testNoteId() } }
		]);
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect({ run: snapshot.run.pendingDecisions, cards: snapshot.pendingDecisions }).toEqual({
			run: [],
			cards: []
		});
	});

	it('clears pending calls when a reviewed run is cancelled before it resumes', async () => {
		const { controller, receipt } = await awaitingApproval([
			{ callId: 'call-reviewed', toolName: 'archive_note', arguments: { noteId: testNoteId() } }
		]);
		await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-reviewed',
			decision: 'approve'
		});
		const snapshot = await controller.cancel(testActor(), receipt.runId);
		expect({ run: snapshot.run.pendingDecisions, cards: snapshot.pendingDecisions }).toEqual({
			run: [],
			cards: []
		});
	});

	describe('the cancellation backstop', () => {
		it('settles the run when the executor never unwinds', async () => {
			vi.useFakeTimers();
			try {
				const { controller, runs, runner } = setup('running');
				const receipt = await controller.submit(testActor(), {
					requestId: '10000000-0000-4000-8000-00000000000f',
					input: 'Hang forever'
				});
				await runner.started.promise;
				await controller.cancel(testActor(), receipt.runId);
				await vi.advanceTimersByTimeAsync(10_000);
				expect(runs.runs.find((run) => run.id === receipt.runId)?.status).toBe('cancelled');
			} finally {
				vi.useRealTimers();
			}
		});

		it('appends exactly one cancelled event when the executor beats the backstop', async () => {
			vi.useFakeTimers();
			try {
				const { controller, runs, runner } = setup('abortable');
				const receipt = await controller.submit(testActor(), {
					requestId: '10000000-0000-4000-8000-000000000010',
					input: 'Settle promptly'
				});
				await runner.started.promise;
				await controller.cancel(testActor(), receipt.runId);
				await vi.advanceTimersByTimeAsync(10_000);
				expect(
					runs.events.filter(
						(record) => record.runId === receipt.runId && record.event.type === 'cancelled'
					).length
				).toBe(1);
			} finally {
				vi.useRealTimers();
			}
		});
	});

	it('requeues an approval decision on the same run', async () => {
		const { controller, receipt } = await awaitingApproval([
			{ callId: 'call-1', toolName: 'archive_note', arguments: {} }
		]);
		const snapshot = await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-1',
			decision: 'approve'
		});
		expect(snapshot.run.status).toBe('queued');
	});

	it('records every call in a batch decision against one requeue', async () => {
		const { controller, runs, receipt } = await awaitingApproval([
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} },
			{ callId: 'call-b', toolName: 'archive_note', arguments: {} }
		]);
		await controller.decideMany(testActor(), {
			runId: receipt.runId,
			callIds: ['call-a', 'call-b'],
			decision: 'approve'
		});
		expect(await runs.loadUnconsumed(receipt.runId)).toHaveLength(2);
	});

	it('records one queue event for separate decisions before execution resumes', async () => {
		const { controller, runs, receipt } = await awaitingApproval([
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} },
			{ callId: 'call-b', toolName: 'archive_note', arguments: {} }
		]);
		await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-a',
			decision: 'approve'
		});
		await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-b',
			decision: 'reject'
		});
		expect(
			runs.events.filter(
				(record) => record.event.type === 'run_queued' && record.event.reason === 'resumed'
			)
		).toHaveLength(1);
	});

	it('rolls back the decision and requeue if the queue event cannot be stored', async () => {
		const { controller, runs, receipt } = await awaitingApproval([
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} }
		]);
		runs.failedEvent = 'run_queued';
		try {
			await controller
				.decide(testActor(), { runId: receipt.runId, callId: 'call-a', decision: 'approve' })
				.catch((error) => {
					if (!(error instanceof Error) || error.message !== 'Event storage unavailable')
						throw error;
					return { kind: 'failure' as const };
				});
			expect({
				status: runs.runs.find((run) => run.id === receipt.runId)?.status,
				decisions: await runs.loadUnconsumed(receipt.runId)
			}).toEqual({ status: 'awaiting_approval', decisions: [] });
		} finally {
			runs.failedEvent = undefined;
		}
	});

	it('records nothing when one call in a batch is not pending (1/2)', async () => {
		const { controller, receipt } = await awaitingApproval([
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} }
		]);
		await expect(
			controller.decideMany(testActor(), {
				runId: receipt.runId,
				callIds: ['call-a', 'call-missing'],
				decision: 'approve'
			})
		).rejects.toThrow('The pending tool call was not found');
	});

	it('records nothing when one call in a batch is not pending (2/2)', async () => {
		const { controller, runs, receipt } = await awaitingApproval([
			{ callId: 'call-a', toolName: 'create_todo', arguments: {} }
		]);
		await controller
			.decideMany(testActor(), {
				runId: receipt.runId,
				callIds: ['call-a', 'call-missing'],
				decision: 'approve'
			})
			.catch((error) => {
				if (!(error instanceof Error) || error.message !== 'The pending tool call was not found')
					throw error;
				return { kind: 'failure' };
			});
		expect(await runs.loadUnconsumed(receipt.runId)).toHaveLength(0);
	});

	it('rejects a contradictory duplicate decision', async () => {
		const { controller, receipt } = await awaitingApproval([
			{ callId: 'call-2', toolName: 'archive_note', arguments: {} }
		]);
		await controller.decide(testActor(), {
			runId: receipt.runId,
			callId: 'call-2',
			decision: 'approve'
		});
		await expect(
			controller.decide(testActor(), {
				runId: receipt.runId,
				callId: 'call-2',
				decision: 'reject'
			})
		).rejects.toThrow('different decision');
	});

	it('manual retry creates ancestry without another prompt', async () => {
		const { controller, conversations, runner } = setup('running');
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000009',
			input: 'Try this once'
		});
		await runner.started.promise;
		await controller.failRun(receipt.runId, new Error('Provider unavailable'));
		await controller.retry(testActor(), receipt.runId, '10000000-0000-4000-8000-000000000010');
		expect(conversations.messages.filter((message) => message.role === 'user')).toHaveLength(1);
	});

	it('manual retry points at the failed run', async () => {
		const { controller, runs, runner } = setup('running');
		const receipt = await controller.submit(testActor(), {
			requestId: '10000000-0000-4000-8000-000000000011',
			input: 'Try this once'
		});
		await runner.started.promise;
		await controller.failRun(receipt.runId, new Error('Provider unavailable'));
		const retried = await controller.retry(
			testActor(),
			receipt.runId,
			'10000000-0000-4000-8000-000000000012'
		);
		const child = runs.runs.find((run) => run.id === retried.runId);
		expect(child?.retryOfRunId).toBe(receipt.runId as AgentRunId);
	});
});
