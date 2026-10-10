import { restoredToolReviews } from '$lib/testing/agent/fixtures/tool-reviews';
import { createAgentStream } from '$lib/server/factories/agent/stream-factory';
import { AgentSdkInfrastructure } from '$lib/server/adapters/agent/execution-infrastructure';
import { AgentToolRecoveryService } from '$lib/server/services/agent/runs/tool-recovery';
import { AgentPromptService } from '$lib/server/services/agent/runs/instructions';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { createTestAgentContext as createAgentContext } from '$lib/testing/agent/fixtures/context-formatter';
import { AgentExecution } from '$lib/server/controllers/agent/execution';
import { AgentTools } from '$lib/server/factories/agent/agent-tool-factory';
import { createConversationSession } from '$lib/server/factories/agent/conversation-factory';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryToolCallingModel } from '$lib/testing/agent/fakes/in-memory-tool-calling-model';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';

import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import { RunCheckpoints } from '$lib/server/services/agent/runs/checkpoints';
import { RunPreparation } from '$lib/server/services/agent/runs/preparation';
import { RunCancellation } from '$lib/server/services/agent/runs/cancellation';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryGatedMemoryEntries } from '$lib/testing/memory/fakes/in-memory-gated-memory';
import { noteReviewBuilder } from '$lib/testing/notes/fixtures/note-review';
import { describe, expect, it } from 'vitest';
import { AgentProviderFailure } from '$lib/errors';
import type {
	AgentExecutionUpdate,
	AgentRun,
	AgentRunContext,
	AgentRunId,
	ConversationId,
	ToolActivity
} from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentToolExecutor } from '$lib/server/services/agent/runs/contracts';
import type { ProvenanceId } from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testProvenanceId } from '$lib/testing/workspace/fixtures/domain-builders';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { AgentRunner } from '$lib/server/services/agent/runs/contracts';
import type { ConversationMessages } from '$lib/server/services/agent/conversations/archive';

const testRunId = '30000000-0000-4000-8000-000000000001' as AgentRunId;
const testConversationId = '30000000-0000-4000-8000-0000000000c1' as ConversationId;
const testTime = '2026-01-01T00:00:00.000Z' as DateTime;
const resolvedContext: AgentRunContext = {
	contextNotes: [],
	contextResources: [],
	skills: { items: [] }
};

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

const setup = <T extends AgentRunner>(
	runner: T,
	options?: {
		readonly contextMemory?: InMemoryMemoryEntryRepository;
		readonly pendingDecisions?: AgentRun['pendingDecisions'];
	}
) => {
	const runs = new InMemoryAgentRunPersistence();
	const sessions = new InMemoryAgentSessionRepository();
	const notified: AgentRunId[] = [];
	const approvalVisibility: boolean[] = [];
	const journalled: { kind: 'text' | 'reasoning'; text: string; cursor?: string }[] = [];
	const toolRows: ToolActivity[] = [];
	const run: AgentRun = {
		kind: 'agent',
		id: testRunId,
		userId: testActor().userId,
		conversationId: testConversationId,
		model: 'openai/test-model',
		executionMode: 'approval_required',
		status: 'queued',
		requestId: '30000000-0000-4000-8000-0000000000r1',
		pendingDecisions: options?.pendingDecisions ?? [],
		provenanceId: testProvenanceId() as ProvenanceId,
		contextSnapshot: resolvedContext,
		inputSnapshot: { conversationId: testConversationId, prompt: 'Do the thing' },
		definitionVersion: 2,
		createdAt: testTime,
		updatedAt: testTime
	};
	runs.runs.push(run);
	const transactions = new InMemoryTransactionRunner([runs, sessions]);
	const lifecycle = new Agent(
		capabilityDependencies<AgentDependencies>({
			...agentRulesFixture(),
			runs,
			cancellations: new RunCancellation(runs),
			preparation: new RunPreparation(runs),
			checkpoints: new RunCheckpoints(runs),
			webSearchOverrides: CHAT_WEB_SEARCH_DEFAULTS,
			events: runs,
			decisions: runs,
			sessions,
			transactionRunner: transactions,
			settlements: new RunSettlements(runs, runs),
			contextFormatter: createAgentContext(),
			contextNotes: new InMemoryNoteContent(),
			contextSkills: new InMemorySkills(),
			builtInSkills: builtInSkillsFixture().builtInSkills,
			contextProjects: new InMemoryProjects(),
			contextMemory: options?.contextMemory ?? new InMemoryMemoryEntryRepository(),
			conversationSessions: new ConversationArchive(new InMemoryConversationRepository()),
			provenance: {
				record: async () => {
					throw new Error('Unexpected provenance record');
				}
			},
			conversationMessages: capabilityDependencies<ConversationMessages>({
				recordToolActivity: async (_actor, _conversationId, activity) => {
					toolRows.push(activity);
				},
				recordAssistantText: async (_actor, _conversationId, text, _model, provenance) => {
					journalled.push({ kind: 'text', text, cursor: provenance?.eventCursor });
				},
				recordAssistantReasoning: async (_actor, _conversationId, text, _model, provenance) => {
					journalled.push({ kind: 'reasoning', text, cursor: provenance?.eventCursor });
				}
			}),
			runner,
			eventBus: {
				notify: (runId) => {
					notified.push(runId);
					if (runs.events.some((record) => record.event.type === 'approval_required')) {
						const saved = runs.runs.find((row) => row.id === runId);
						approvalVisibility.push(
							saved?.status === 'awaiting_approval' &&
								saved.pendingDecisions.some((pending) => pending.review !== undefined)
						);
					}
				}
			}
		})
	);
	return { lifecycle, runs, notified, runner, journalled, toolRows, approvalVisibility };
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
const requestCancellation = async (runs: InMemoryAgentRunPersistence) => {
	const cancellations = new RunCancellation(runs);
	const current = await cancellations.getForWrite(testActor(), testRunId);
	const change = cancellations.plan(current.status, testTime);
	if (change) await cancellations.persist(testActor(), testRunId, change);
};

const currentRun = (runs: InMemoryAgentRunPersistence) =>
	runs.runs.find((run) => run.id === testRunId)!;

describe('stopping a running agent run', () => {
	it('settles and publishes cancellation to the run, stream, and subscribers', async () => {
		const { runs, outcome, notified } = await stopMidStream();
		expect({
			status: currentRun(runs).status,
			finished: currentRun(runs).finishedAt !== undefined,
			event: runs.events.some((record) => record.event.type === 'cancelled'),
			outcome,
			notifiedMoreThanOnce: notified.filter((runId) => runId === testRunId).length > 1
		}).toEqual({
			status: 'cancelled',
			finished: true,
			event: true,
			outcome: 'cancelled',
			notifiedMoreThanOnce: true
		});
	});
});

describe('a cancellation the provider stream never unwinds', () => {
	/**
	 * Swallows the abort and keeps streaming, the way a hung provider call or a
	 * tool doing local work does: the signal fires but nothing throws.
	 */
	const swallowingRunner = () => {
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
				yield {
					type: 'event',
					event: { type: 'text_delta', text: 'still going' }
				} as AgentExecutionUpdate;
			}
		};
	};

	it('settles at the next stream boundary', async () => {
		const context = setup(swallowingRunner());
		const controller = new AbortController();
		const execution = context.lifecycle.execute(testRunId, controller.signal);
		await context.runner.started;
		await requestCancellation(context.runs);
		controller.abort();
		await execution;
		expect(currentRun(context.runs).status).toBe('cancelled');
	});
});

describe('a cancellation that races the end of a run', () => {
	/** Holds its final update until the test releases it, so the cancel lands first. */
	const finishingRunner = (final: AgentExecutionUpdate) => {
		let release: () => void;
		const finishing = new Promise<void>((resolve) => (release = resolve));
		return {
			release: () => release(),
			execute: async function* () {
				await finishing;
				yield final;
			}
		};
	};

	const untilRunning = async (runs: InMemoryAgentRunPersistence) => {
		while (currentRun(runs).status !== 'running') await Promise.resolve();
	};

	it('wins against a completion that lands after it', async () => {
		const runner = finishingRunner({ type: 'completed', sessionItems: [] });
		const context = setup(runner);
		const execution = context.lifecycle.execute(testRunId, new AbortController().signal);
		await untilRunning(context.runs);
		await requestCancellation(context.runs);
		runner.release();
		const outcome = await execution;
		expect({ status: currentRun(context.runs).status, outcome }).toEqual({
			status: 'cancelled',
			outcome: 'cancelled'
		});
	});

	it('wins against an approval park that lands after it', async () => {
		const runner = finishingRunner({
			type: 'approval_checkpoint',
			serializedState: 'parked',
			pendingDecisions: [],
			sessionItems: []
		});
		const context = setup(runner);
		const execution = context.lifecycle.execute(testRunId, new AbortController().signal);
		await untilRunning(context.runs);
		await requestCancellation(context.runs);
		runner.release();
		const outcome = await execution;
		expect({ status: currentRun(context.runs).status, outcome }).toEqual({
			status: 'cancelled',
			outcome: 'cancelled'
		});
	});
});

describe('finishing a cancellation out of band', () => {
	it('settles a run parked in cancelling', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await new RunPreparation(runs).claim(testRunId, testTime);
		await requestCancellation(runs);
		await lifecycle.finishCancellation(testRunId);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a completed run and its event journal untouched', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await new RunPreparation(runs).claim(testRunId, testTime);
		await new RunSettlements(runs, runs).claim(testRunId, {
			kind: 'completed',
			conversationId: testConversationId,
			model: currentRun(runs).model
		});
		await lifecycle.finishCancellation(testRunId);
		expect({
			status: currentRun(runs).status,
			cancelledEvent: runs.events.some((record) => record.event.type === 'cancelled')
		}).toEqual({ status: 'completed', cancelledEvent: false });
	});

	it('appends exactly one cancelled event when two settlers race', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await new RunPreparation(runs).claim(testRunId, testTime);
		await requestCancellation(runs);
		await Promise.all([
			lifecycle.finishCancellation(testRunId),
			lifecycle.finishCancellation(testRunId)
		]);
		expect(runs.events.filter((record) => record.event.type === 'cancelled').length).toBe(1);
	});
});

describe('a cancellation that races preparation', () => {
	/**
	 * Freezes the context build so the cancel can land after the run reached
	 * `running` but before the locked context write. The signal is never aborted:
	 * settlement must not depend on abort timing.
	 */
	const racingSetup = () => {
		const memory = new InMemoryGatedMemoryEntries();
		const context = setup(abortingRunner(), {
			contextMemory: memory
		});
		// An empty snapshot forces prepare to write one, which is the write the
		// cancel races.
		const current = context.runs.runs[0]!;
		if (current.kind !== 'agent') throw new Error('Expected an agent run');
		const { contextSnapshot: _contextSnapshot, ...unprepared } = current;
		void _contextSnapshot;
		context.runs.runs[0] = unprepared;
		return { ...context, building: memory.started, release: () => memory.release() };
	};

	it('reports cancellation already settled by another process before context was ready', async () => {
		const context = racingSetup();
		const execution = context.lifecycle.execute(testRunId, new AbortController().signal);
		await context.building;
		await requestCancellation(context.runs);
		await context.lifecycle.finishCancellation(testRunId);
		context.release();
		expect(await execution).toBe('cancelled');
	});

	it('reports the cancelled outcome to the caller', async () => {
		const context = racingSetup();
		const execution = context.lifecycle.execute(testRunId, new AbortController().signal);
		await context.building;
		await requestCancellation(context.runs);
		context.release();
		const outcome = await execution;
		expect({ status: currentRun(context.runs).status, outcome }).toEqual({
			status: 'cancelled',
			outcome: 'cancelled'
		});
	});
});

describe('settling a run whose execution threw', () => {
	/** Drives a turn to the point the controller's rejection handler sees. */
	const crash = async (error: unknown) => {
		const context = setup(throwingRunner(error));
		await context.lifecycle.execute(testRunId, new AbortController().signal).catch(() => undefined);
		await context.lifecycle.failRun(
			testRunId,
			error instanceof Error ? error : new Error(String(error))
		);
		return context;
	};

	it('rethrows so the caller can settle the run', async () => {
		const { lifecycle } = setup(throwingRunner(new Error('Provider exploded')));
		await expect(lifecycle.execute(testRunId, new AbortController().signal)).rejects.toThrow(
			'Provider exploded'
		);
	});

	it('marks a provider failure in both the run and client event stream', async () => {
		const { runs } = await crash(new Error('Provider exploded'));
		expect({
			status: currentRun(runs).status,
			failedEvent: runs.events.some((record) => record.event.type === 'failed')
		}).toEqual({ status: 'failed', failedEvent: true });
	});

	it('records the provider error code', async () => {
		const { runs } = await crash(
			new AgentProviderFailure('Provider exploded', 'EXTERNAL_SERVICE', false)
		);
		expect(currentRun(runs).providerErrorCode).toBe('EXTERNAL_SERVICE');
	});

	it('cancels rather than fails a run the user asked to stop', async () => {
		const error = new Error('Stream ended oddly');
		const { lifecycle, runs } = setup(throwingRunner(error));
		await new RunPreparation(runs).claim(testRunId, testTime);
		await requestCancellation(runs);
		await lifecycle.failRun(testRunId, error);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a run that already completed alone', async () => {
		const error = new Error('Late failure');
		const { lifecycle, runs } = setup(throwingRunner(error));
		await new RunPreparation(runs).claim(testRunId, testTime);
		await new RunSettlements(runs, runs).claim(testRunId, {
			kind: 'completed',
			conversationId: testConversationId,
			model: currentRun(runs).model
		});
		await lifecycle.failRun(testRunId, error);
		expect(currentRun(runs).status).toBe('completed');
	});

	/**
	 * The journal is append-only, so a call's last written row is its status forever. A run
	 * that died still holding an approval left that row saying `approval_required`, and a
	 * reopened conversation replayed a live Approve/Reject card for a run that could act on
	 * neither answer.
	 */
	const crashHoldingApproval = async () => {
		const error = new Error('Provider exploded');
		const context = setup(throwingRunner(error), {
			pendingDecisions: [
				{ callId: 'call-parked', toolName: 'update_agent_preferences', arguments: {} }
			]
		});
		await new RunPreparation(context.runs).claim(testRunId, testTime);
		await context.lifecycle.failRun(
			testRunId,
			error instanceof Error ? error : new Error(String(error))
		);
		return context;
	};

	it('settles the parked tool call and clears its pending decision', async () => {
		const { runs, toolRows } = await crashHoldingApproval();
		expect({
			toolStatuses: toolRows.map((row) => row.status),
			pending: currentRun(runs).pendingDecisions
		}).toEqual({ toolStatuses: ['failed'], pending: [] });
	});
});

/** Each successful mutation requests workspace synchronization. */
const mutatingRunner = (calls: readonly { toolName: ToolName; callId?: string }[]) => ({
	execute: async function* (input: {
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate> {
		for (const call of calls)
			await input.toolExecutor.execute(
				{ ...call, arguments: {}, classification: 'mutation' },
				async () => ({ ok: true })
			);
		for (const call of calls)
			if (call.callId !== undefined)
				yield {
					type: 'event',
					event: { type: 'tool_succeeded', callId: call.callId, name: call.toolName }
				};
		yield { type: 'completed', sessionItems: [] };
	} as never
});

const staleResources = async (
	calls: readonly { toolName: ToolName; callId?: string }[]
): Promise<string[]> => {
	const context = setup(mutatingRunner(calls) as never);
	await context.lifecycle.execute(testRunId, new AbortController().signal);
	return context.runs.events.flatMap((record) =>
		record.event.type === 'resources_stale' ? [...record.event.resources] : []
	);
};

describe('telling the client what a mutation left stale', () => {
	it('reports each mutation the provider gave no call id for', async () => {
		expect(
			await staleResources([{ toolName: 'save_note' }, { toolName: 'archive_project' }])
		).toEqual(['workspace', 'workspace']);
	});

	it('reports a committed mutation regardless of its provider call id', async () => {
		expect(await staleResources([{ toolName: 'save_note', callId: 'call-1' }])).toEqual([
			'workspace'
		]);
	});
});

/**
 * A turn that thinks, speaks, works, then speaks again. What is journalled decides what a
 * reopened conversation can show, and for a long time it could show neither the thinking nor
 * the order.
 */
const talkativeRunner = () => ({
	execute: async function* (): AsyncIterable<AgentExecutionUpdate> {
		yield { type: 'event', event: { type: 'reasoning_delta', text: 'It has five bullets.' } };
		yield { type: 'event', event: { type: 'text_delta', text: 'Reading it first.' } };
		yield {
			type: 'event',
			event: { type: 'tool_started', callId: 'c1', name: 'get_note', arguments: {} }
		};
		yield { type: 'event', event: { type: 'tool_succeeded', callId: 'c1', name: 'get_note' } };
		yield { type: 'event', event: { type: 'text_delta', text: 'Done.' } };
		yield { type: 'completed', sessionItems: [] };
	} as never
});

const completeTalkativeTurn = async () => {
	const context = setup(talkativeRunner() as never);
	await context.lifecycle.execute(testRunId, new AbortController().signal);
	return context;
};

describe('what a finished turn leaves behind to be reopened', () => {
	it('journals ordered reasoning and speech with distinct cursors', async () => {
		const { journalled } = await completeTalkativeTurn();
		expect({
			reasoning: journalled.some((entry) => entry.kind === 'reasoning'),
			text: journalled.filter((entry) => entry.kind === 'text').map((entry) => entry.text),
			hasCursors: journalled.every((entry) => entry.cursor !== undefined),
			uniqueCursors: new Set(journalled.map((entry) => entry.cursor)).size === journalled.length
		}).toEqual({
			reasoning: true,
			text: ['Reading it first.', 'Done.'],
			hasCursors: true,
			uniqueCursors: true
		});
	});
});

describe('Durable note approval publication', () => {
	const prepared = noteReviewBuilder();
	const pending = {
		callId: 'review-1',
		toolName: 'save_note' as const,
		arguments: { noteId: prepared.change.noteId, markdown: 'Tuesday' },
		review: { kind: 'note_change' as const, content: JSON.stringify(prepared) }
	};
	const checkpoint = () =>
		setup({
			execute: async function* () {
				yield {
					type: 'approval_checkpoint' as const,
					serializedState: 'provider-checkpoint',
					pendingDecisions: [pending],
					sessionItems: []
				};
			}
		});
	it('publishes the durable review to the run, event, and replayable tool row', async () => {
		const { lifecycle, runs, toolRows, approvalVisibility } = checkpoint();
		await lifecycle.execute(testRunId, new AbortController().signal);
		expect({
			run: currentRun(runs),
			visibleAfterCheckpoint: approvalVisibility,
			event: runs.events.find((record) => record.event.type === 'approval_required')?.event,
			toolRows
		}).toMatchObject({
			run: {
				status: 'awaiting_approval',
				serializedState: 'provider-checkpoint',
				pendingDecisions: [pending]
			},
			visibleAfterCheckpoint: [true],
			event: { review: pending.review },
			toolRows: [{ status: 'approval_required', review: pending.review }]
		});
	});
});

it('journals a failed tool call and its correction through the production runner', async () => {
	const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.') });
	const notes = reviewedNoteFixture(note);
	const model = new InMemoryToolCallingModel(
		'edit_note',
		JSON.stringify({ noteId: note.id, edits: [] }),
		JSON.stringify({ noteId: note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] }),
		'Too small'
	);
	const reasoning = new AgentExecution(
		new AgentPromptService(),
		new AgentToolRecoveryService(),
		createAgentStream,
		async ({ run, executor, signal }) => {
			if (!run.inputSnapshot) throw new Error('Run input is missing');
			return new AgentTools(
				testTokenizer,
				notes.factory,
				testActor(),
				run.executionMode,
				{ provenanceId: testProvenanceId(), input: run.inputSnapshot, model: run.model },
				executor,
				new InMemoryToolRetriever(),
				{ isEnabled: () => true },
				restoredToolReviews(notes.factory, testActor(), run.pendingDecisions),
				signal
			);
		},
		{
			create: (actor, conversationId) =>
				createConversationSession(new InMemoryAgentSessionRepository(), actor, conversationId, {
					virtualize: async (_actor, _id, item) => item
				})
		},
		true,
		new AgentSdkInfrastructure(
			'test-key',
			'https://unused.test',
			'https://unused.test',
			undefined,
			() => new InMemoryModelProvider(model)
		),
		undefined
	);
	const fixture = setup(reasoning);
	fixture.runs.runs = fixture.runs.runs.map((run) => ({ ...run, executionMode: 'auto_accept' }));
	await fixture.lifecycle.execute(testRunId, new AbortController().signal);
	expect({
		status: currentRun(fixture.runs).status,
		body: notes.content.notes[0].plainText,
		rows: fixture.toolRows
			.filter((row) => row.status !== 'running')
			.map((row) => ({ status: row.status, callId: row.callId }))
	}).toEqual({
		status: 'completed',
		body: 'Launch Tuesday.',
		rows: [
			{ status: 'reported_failure', callId: 'call-invalid' },
			{ status: 'succeeded', callId: 'call-corrected' }
		]
	});
});
