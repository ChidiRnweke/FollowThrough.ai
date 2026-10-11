import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import { RunTransitions } from '$lib/server/services/agent/runs/transitions';
import { z } from 'zod';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import {
	ScriptedAgentTurns,
	InMemoryAgentTurns
} from '$lib/testing/agent/fakes/in-memory-agent-turns';
import { harnessTurnDependencies } from '$lib/testing/agent/fixtures/harness';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { ConversationHistoryService } from '$lib/server/services/agent/conversations/history';
import { AgentTurnService } from '$lib/server/services/agent/runs/turns';
import { createAgentTools } from '$lib/server/factories/agent/tools/definitions';
import { parseProviderStreamEvent } from '$lib/server/infrastructure/agents/provider-events';
import type { AgentTool } from '$lib/models/agent-tool-protocol';
import { RunContext } from '@openai/agents';
import {
	InMemoryToolBatchModel,
	InMemoryToolCallingModel
} from '$lib/testing/agent/fakes/in-memory-tool-calling-model';
import { OpenAIProvider, type Model } from '@openai/agents';
import OpenAI from 'openai';
import type { Note } from '$lib/models/notes';
import { createTestAgentContext as createAgentContext } from '$lib/testing/agent/fixtures/context-formatter';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
const noteMarkdown = new NoteMarkdownCodec();

import { AgentProviderFailure } from '$lib/errors';
import type {
	AgentExecutionUpdate,
	AgentRun,
	AgentRunContext,
	AgentRunId,
	ConversationId,
	ToolActivity
} from '$lib/models/agent';
import { CHAT_WEB_SEARCH_DEFAULTS } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ProvenanceId } from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import type { ConversationMessages } from '$lib/server/services/agent/conversations/archive';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunSettlements } from '$lib/server/services/agent/runs/settlement';
import { ToolActivityProjection } from '$lib/server/services/agent/conversations/tool-activity';
import { InMemorySkills } from '$lib/testing/agent/fakes/in-memory-agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import { InMemoryAgentSessionRepository } from '$lib/testing/agent/fakes/in-memory-agent-sessions';
import { InMemoryConversationRepository } from '$lib/testing/agent/fakes/in-memory-conversations';
import { InMemoryGatedMemoryEntries } from '$lib/testing/memory/fakes/in-memory-gated-memory';
import { InMemoryMemoryEntryRepository } from '$lib/testing/memory/fakes/in-memory-memory-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { noteReviewBuilder } from '$lib/testing/notes/fixtures/note-review';
import { InMemoryProjects } from '$lib/testing/projects/fakes/in-memory-projects';
import { builtInSkillsFixture } from '$lib/testing/skills/fixtures/built-ins';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';

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
const abortingRunner = () =>
	new ScriptedAgentTurns({
		// eslint-disable-next-line require-yield
		events: async function* (input) {
			await new Promise<void>((resolve) => {
				if (input.signal.aborted) return resolve();
				input.signal.addEventListener('abort', () => resolve(), { once: true });
			});
			throw new Error('The operation was aborted');
		}
	});

const throwingRunner = (error: unknown) => {
	const turns = new InMemoryAgentTurns();
	turns.turn = async () => {
		throw error;
	};
	return turns;
};

const setup = <T extends InMemoryAgentTurns | AgentTurnService>(
	runner: T,
	options?: {
		readonly contextMemory?: InMemoryMemoryEntryRepository;
		readonly pendingDecisions?: AgentRun['pendingDecisions'];
		readonly tools?: readonly AgentTool[];
	}
) => {
	const runs = new InMemoryAgentRunPersistence(testActor());
	const sessions = new InMemoryAgentSessionRepository();
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
	const lifecycle = new AgentSdkHarness(
		testActor(),
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			...agentRulesFixture(),
			records: new AgentRunHarnessRecords(runs, runs, runs, sessions),
			transitions: new RunTransitions(runs),
			webSearchOverrides: CHAT_WEB_SEARCH_DEFAULTS,
			transactionRunner: transactions,
			settlements: new RunSettlements(runs, runs),
			contextFormatter: createAgentContext(),
			contextNotes: new InMemoryNoteContent(testActor()),
			contextSkills: new InMemorySkills(),
			builtInSkills: builtInSkillsFixture().builtInSkills,
			contextProjects: new InMemoryProjects(testActor()),
			contextMemory: options?.contextMemory ?? new InMemoryMemoryEntryRepository(testActor()),
			conversationSessions: new ConversationArchive(
				testActor(),
				new InMemoryConversationRepository(testActor())
			),
			provenance: {
				record: async () => {
					throw new Error('Unexpected provenance record');
				}
			},
			toolActivity: new ToolActivityProjection(),
			traceContext: { activeTraceparent: () => undefined },
			conversationMessages: capabilityDependencies<ConversationMessages>({
				recordToolActivity: async (_conversationId, activity) => {
					toolRows.push(activity);
				},
				recordAssistantText: async (_conversationId, text, _model, provenance) => {
					journalled.push({ kind: 'text', text, cursor: provenance?.eventCursor });
				},
				recordAssistantReasoning: async (_conversationId, text, _model, provenance) => {
					journalled.push({ kind: 'reasoning', text, cursor: provenance?.eventCursor });
				}
			}),
			...harnessTurnDependencies(
				runner,
				new ConversationHistoryService(
					sessions,
					new InMemoryAgentFiles(testActor()),
					testTokenizer
				),
				options?.tools ?? []
			)
		})
	);
	return { lifecycle, runs, runner, journalled, toolRows };
};

/** Runs a turn to the point where the provider is streaming, then stops it. */
const stopMidStream = async () => {
	const context = setup(abortingRunner());
	const controller = new AbortController();
	const execution = context.lifecycle.execute(testRunId, controller.signal);
	await context.runner.started.promise;
	await requestCancellation(context.runs);
	controller.abort();
	return { ...context, outcome: await execution };
};

/** Drives a run to `cancelling` the way the controller does before aborting. */
const requestCancellation = async (runs: InMemoryAgentRunPersistence) => {
	const cancellations = new RunTransitions(runs);
	const current = await cancellations.getForWrite(testRunId);
	const change = cancellations.planCancellation(current.status, testTime);
	if (change) await cancellations.persistCancellation(testRunId, change);
};

const currentRun = (runs: InMemoryAgentRunPersistence) =>
	runs.runs.find((run) => run.id === testRunId)!;

describe('stopping a running agent run', () => {
	it('settles cancellation into the run and its event stream', async () => {
		const { runs, outcome } = await stopMidStream();
		expect({
			status: currentRun(runs).status,
			finished: currentRun(runs).finishedAt !== undefined,
			event: runs.events.some((record) => record.event.type === 'cancelled'),
			outcome
		}).toEqual({
			status: 'cancelled',
			finished: true,
			event: true,
			outcome: 'cancelled'
		});
	});
});

describe('a cancellation the provider stream never unwinds', () => {
	/**
	 * Swallows the abort and keeps streaming, the way a hung provider call or a
	 * tool doing local work does: the signal fires but nothing throws.
	 */
	const swallowingRunner = () =>
		new ScriptedAgentTurns({
			events: async function* (input) {
				await new Promise<void>((resolve) => {
					if (input.signal.aborted) return resolve();
					input.signal.addEventListener('abort', () => resolve(), { once: true });
				});
				yield { type: 'text_delta', text: 'still going' };
			}
		});

	it('settles at the next stream boundary', async () => {
		const context = setup(swallowingRunner());
		const controller = new AbortController();
		const execution = context.lifecycle.execute(testRunId, controller.signal);
		await context.runner.started.promise;
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
		const turns = new ScriptedAgentTurns({
			// eslint-disable-next-line require-yield
			events: async function* () {
				await finishing;
			},
			outcome: async () =>
				final.type === 'completed'
					? { kind: 'completed', sessionItems: final.sessionItems }
					: final.type === 'approval_checkpoint'
						? {
								kind: 'approval',
								serialize: () => final.serializedState,
								pending: final.pendingDecisions,
								sessionItems: final.sessionItems
							}
						: { kind: 'completed', sessionItems: [] }
		});
		return Object.assign(turns, { release: () => release() });
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
		await new RunTransitions(runs).claim(testRunId, testTime);
		await requestCancellation(runs);
		await lifecycle.finishCancellation(testRunId);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a completed run and its event journal untouched', async () => {
		const { lifecycle, runs } = setup(abortingRunner());
		await new RunTransitions(runs).claim(testRunId, testTime);
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
		await new RunTransitions(runs).claim(testRunId, testTime);
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
		const memory = new InMemoryGatedMemoryEntries(testActor());
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
		await new RunTransitions(runs).claim(testRunId, testTime);
		await requestCancellation(runs);
		await lifecycle.failRun(testRunId, error);
		expect(currentRun(runs).status).toBe('cancelled');
	});

	it('leaves a run that already completed alone', async () => {
		const error = new Error('Late failure');
		const { lifecycle, runs } = setup(throwingRunner(error));
		await new RunTransitions(runs).claim(testRunId, testTime);
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
		await new RunTransitions(context.runs).claim(testRunId, testTime);
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
const mutatingTool = (name: ToolName): AgentTool => ({
	kind: 'direct',
	name,
	description: name,
	classification: 'mutation',
	parameters: z.object({}).strict(),
	prepare: () => ({ arguments: {}, execute: async () => ({ ok: true }) })
});
const mutatingRunner = (calls: readonly { toolName: ToolName; callId?: string }[]) =>
	new ScriptedAgentTurns({
		// eslint-disable-next-line require-yield
		events: async function* (input) {
			for (const call of calls) {
				const tool = input.tools.find((candidate) => candidate.name === call.toolName);
				if (!tool || tool.type !== 'function') throw new Error(`Missing tool ${call.toolName}`);
				await tool.invoke(
					new RunContext(),
					'{}',
					call.callId === undefined
						? undefined
						: {
								toolCall: {
									type: 'function_call',
									name: call.toolName,
									callId: call.callId,
									arguments: '{}'
								}
							}
				);
			}
		}
	});

const staleResources = async (
	calls: readonly { toolName: ToolName; callId?: string }[]
): Promise<string[]> => {
	const context = setup(mutatingRunner(calls), {
		tools: calls.map((call) => mutatingTool(call.toolName))
	});
	context.runs.runs = context.runs.runs.map((run) => ({ ...run, executionMode: 'auto_accept' }));
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
const providerItem = (
	name: 'tool_called' | 'tool_output',
	rawItem: Readonly<Record<string, string>>
) => parseProviderStreamEvent({ type: 'run_item_stream_event', name, item: { rawItem } });
const talkativeRunner = () =>
	new ScriptedAgentTurns({
		events: async function* () {
			yield { type: 'reasoning_delta', text: 'It has five bullets.' };
			yield { type: 'text_delta', text: 'Reading it first.' };
			yield providerItem('tool_called', { type: 'function_call', callId: 'c1', name: 'get_note' });
			yield providerItem('tool_output', {
				type: 'function_call_result',
				callId: 'c1',
				name: 'get_note',
				output: '{}'
			});
			yield { type: 'text_delta', text: 'Done.' };
		}
	});

const completeTalkativeTurn = async () => {
	const context = setup(talkativeRunner());
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
		setup(
			new ScriptedAgentTurns({
				events: async function* () {},
				outcome: async () => ({
					kind: 'approval',
					serialize: () => 'provider-checkpoint',
					pending: [pending],
					sessionItems: []
				})
			})
		);
	it('publishes the durable review to the run, event, and replayable tool row', async () => {
		const { lifecycle, runs, toolRows } = checkpoint();
		await lifecycle.execute(testRunId, new AbortController().signal);
		expect({
			run: currentRun(runs),
			event: runs.events.find((record) => record.event.type === 'approval_required')?.event,
			toolRows
		}).toMatchObject({
			run: {
				status: 'awaiting_approval',
				serializedState: 'provider-checkpoint',
				pendingDecisions: [pending]
			},
			event: { review: pending.review },
			toolRows: [{ status: 'approval_required', review: pending.review }]
		});
	});
});

/**
 * The production runner over one note that says "Launch Monday.", against a scripted model or,
 * with `fetch`, against the real provider client and a scripted HTTP transport.
 */
const productionRun = async (
	model: ((note: Note) => Model) | { readonly fetch: typeof globalThis.fetch }
) => {
	const note = noteBuilder({ ...noteMarkdown.read('Launch Monday.') });
	const notes = reviewedNoteFixture(note);
	const reasoning = new AgentTurnService({
		models: () =>
			typeof model === 'function'
				? new InMemoryModelProvider(model(note))
				: new OpenAIProvider({
						openAIClient: new OpenAI({
							apiKey: 'test-key',
							baseURL: 'https://unused.test',
							fetch: model.fetch
						}),
						useResponses: false
					}),
		images: capabilityDependencies<Pick<OpenAI, 'chat'>>({})
	});
	const tools = createAgentTools(notes.factory, {
		provenanceId: testProvenanceId(),
		input: { conversationId: testConversationId, prompt: 'Do the thing' },
		model: 'openai/test-model'
	});
	const fixture = setup(reasoning, { tools });
	fixture.runs.runs = fixture.runs.runs.map((run) => ({ ...run, executionMode: 'auto_accept' }));
	// As the background executor does: a run whose execution threw is settled as failed.
	await fixture.lifecycle
		.execute(testRunId, new AbortController().signal)
		.catch((error: Error) => fixture.lifecycle.failRun(testRunId, error));
	return {
		status: currentRun(fixture.runs).status,
		failure: fixture.runs.events.find((record) => record.event.type === 'failed')?.event,
		body: notes.content.notes[0].plainText,
		rows: fixture.toolRows
			.filter((row) => row.status !== 'running')
			.map((row) => ({ status: row.status, name: row.name, callId: row.callId }))
	};
};

const editArguments = (note: Note) =>
	JSON.stringify({ noteId: note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] });

it('journals a failed tool call and its correction through the production runner', async () => {
	expect(
		await productionRun(
			(note) =>
				new InMemoryToolCallingModel(
					'edit_note',
					JSON.stringify({ noteId: note.id, edits: [] }),
					editArguments(note),
					'Too small'
				)
		)
	).toEqual({
		status: 'completed',
		body: 'Launch Tuesday.',
		rows: [
			{ status: 'reported_failure', name: 'edit_note', callId: 'call-invalid' },
			{ status: 'succeeded', name: 'edit_note', callId: 'call-corrected' }
		]
	});
});

/**
 * The SDK answers malformed JSON and unknown tool names itself, and the run goes on (ADR 0015:
 * the failure is reported, not swallowed). Trace `1cde38f9…` (2026-10-08) held a malformed and
 * a valid call in one generation; the run failed with `MALFORMED_TOOL_ARGUMENTS` instead.
 */
describe('A call the SDK recovers from does not end the run', () => {
	// Sibling calls in one generation settle in no promised order.
	const settled = async (outcome: ReturnType<typeof productionRun>) => {
		const { rows, ...rest } = await outcome;
		return {
			...rest,
			rows: [...rows].sort((a, b) => String(a.callId).localeCompare(String(b.callId)))
		};
	};
	const sibling = (first: { name: string; arguments: string }) => (note: Note) =>
		new InMemoryToolBatchModel([
			{ ...first, callId: 'broken' },
			{ name: 'edit_note', callId: 'valid', arguments: editArguments(note) }
		]);

	it('completes when malformed JSON arrives beside a valid call', async () => {
		expect(
			await settled(
				productionRun(sibling({ name: 'edit_note', arguments: '{"noteId": "x", "edits": [' }))
			)
		).toEqual({
			status: 'completed',
			body: 'Launch Tuesday.',
			rows: [
				{ status: 'failed', name: 'edit_note', callId: 'broken' },
				{ status: 'succeeded', name: 'edit_note', callId: 'valid' }
			]
		});
	});

	it('completes when the model calls a tool that does not exist, and journals the attempt', async () => {
		expect(await settled(productionRun(sibling({ name: 'edit_notes', arguments: '{}' })))).toEqual({
			status: 'completed',
			body: 'Launch Tuesday.',
			rows: [
				{ status: 'failed', name: 'edit_notes', callId: 'broken' },
				{ status: 'succeeded', name: 'edit_note', callId: 'valid' }
			]
		});
	});

	it("corrects malformed JSON once the model has the SDK's feedback", async () => {
		const outcome = await productionRun(
			(note) =>
				new InMemoryToolCallingModel(
					'edit_note',
					'{"noteId": "x", "edits": [',
					editArguments(note),
					'valid JSON'
				)
		);
		expect({ status: outcome.status, body: outcome.body }).toEqual({
			status: 'completed',
			body: 'Launch Tuesday.'
		});
	});
});

/**
 * Six OpenRouter rejections in the agent error RCA (E1) kept only "400 Provider returned error":
 * nothing said which upstream provider rejected the request or which request it was. The
 * provider's name and request id identify it; its raw upstream body may echo user content and
 * is not kept.
 */
it('settles a provider rejection as failed and keeps who rejected which request', async () => {
	const rejection = async () =>
		new Response(
			JSON.stringify({
				error: {
					message: 'Provider returned error',
					code: 400,
					metadata: { raw: 'echoed private prompt', provider_name: 'OpenAI' }
				}
			}),
			{ status: 400, headers: { 'content-type': 'application/json', 'x-request-id': 'req-e1' } }
		);
	const { status, failure } = await productionRun({ fetch: rejection });
	expect({ status, failure }).toEqual({
		status: 'failed',
		failure: {
			type: 'failed',
			runId: testRunId,
			code: '400',
			message: '400 Provider returned error (provider OpenAI, request req-e1)',
			retryable: false
		}
	});
});
