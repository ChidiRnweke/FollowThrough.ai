import type { FunctionTool } from '@openai/agents';
import { describe, expect, it } from 'vitest';
import type { AgentRunId, AgentRunReceipt, ConversationId } from '$lib/models/agent';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { ScheduleId } from '$lib/models/schedules';
import type { AgentHarness } from '$lib/server/controllers/agent/controller';
import { Schedules } from '$lib/server/controllers/schedules/controller';
import { jsonObjectSchema } from '$lib/server/infrastructure/agents/sdk-tool';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { ScheduleLibrary } from '$lib/server/services/schedules/library';
import { ScheduleRuns } from '$lib/server/services/schedules/runs';
import { ScheduleRules } from '$lib/services/schedules/rules';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import { directTool } from '$lib/testing/agent/fixtures/direct-tool';
import { createAgentToolSurface } from '$lib/testing/agent/fixtures/tool-surface';
import {
	InMemoryScheduleOccurrenceRepository,
	InMemoryScheduleRepository,
	InMemoryScheduleTable
} from '$lib/testing/schedules/fakes/in-memory-schedules';
import {
	brussels,
	mondayMorning,
	scheduleBuilder,
	testScheduleId,
	tuesdayRun
} from '$lib/testing/schedules/fixtures/schedules';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	testActor,
	testConversationId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const CHANGE_TOOLS = [
	'create_schedule',
	'delete_schedule',
	'pause_schedule',
	'resume_schedule',
	'run_schedule',
	'update_schedule'
];
const READ_TOOLS = ['get_schedule', 'list_schedule_runs', 'list_schedules'];

const brief = {
	title: 'Morning brief',
	prompt: 'Write a brief of what is due today as a note in Inbox.',
	recurrence: { kind: 'weekdays', time: { hour: 8, minute: 0 } },
	timeZone: brussels
};

const setup = (
	mode: 'approval_required' | 'auto_accept' = 'auto_accept',
	startedBy: 'person' | 'schedule' = 'person'
) => {
	const table = new InMemoryScheduleTable();
	const library = new ScheduleLibrary(new InMemoryScheduleRepository(testActor(), table));
	const controller = new Schedules(testActor(), {
		now: () => mondayMorning,
		rules: new ScheduleRules(),
		reader: library,
		writer: library,
		runs: new ScheduleRuns(new InMemoryScheduleOccurrenceRepository(() => undefined)),
		transactionRunner: new InMemoryTransactionRunner([table])
	});
	const runsStarted: ScheduleId[] = [];
	const harness = capabilityDependencies<AgentHarness>({
		runScheduleNow: async (input): Promise<AgentRunReceipt> => {
			runsStarted.push(input.scheduleId);
			return {
				runId: '32000000-0000-4000-8000-000000000001' as AgentRunId,
				conversationId: '33000000-0000-4000-8000-000000000001' as ConversationId,
				status: 'queued',
				latestCursor: '1'
			};
		}
	});
	const surface = createAgentToolSurface(
		testTokenizer,
		capabilityDependencies<ControllerFactory>({
			schedules: () => controller,
			agentHarness: () => harness
		}),
		mode,
		{
			provenanceId: testProvenanceId(),
			input: {
				conversationId: testConversationId(),
				prompt: 'Brief me every weekday at eight',
				...(startedBy === 'schedule'
					? {
							schedule: {
								scheduleId: testScheduleId(),
								title: 'Morning brief',
								scheduledFor: tuesdayRun,
								timeZone: brussels
							}
						}
					: {})
			},
			model: 'openai/gpt-5.6'
		},
		{ completed: async () => {} },
		new InMemoryToolRetriever(),
		{ isEnabled: () => true }
	);
	const tool = (name: string) =>
		directTool(surface.definitions().find((candidate) => candidate.name === name));
	// Arguments are checked before a tool runs, so a refused call rejects like a failed one.
	const run = async (name: string, input: AgentPayloadObject) =>
		tool(name).prepare(input).execute(new AbortController().signal);
	return { table, surface, run, runsStarted };
};

describe('the agent’s schedule tools', () => {
	it('save a schedule that asks before each change', async () => {
		const { table, run } = setup();

		await run('create_schedule', brief);

		expect(
			table.rows.map((schedule) => ({
				userId: schedule.userId,
				title: schedule.title,
				executionMode: schedule.executionMode,
				state: schedule.status === 'active' && schedule.nextRunAt
			}))
		).toEqual([
			{
				userId: testActor().userId,
				title: 'Morning brief',
				executionMode: 'approval_required',
				state: tuesdayRun
			}
		]);
	});

	it('refuse an execution mode, so no tool call makes a schedule act without asking', async () => {
		const { table, run } = setup();
		table.rows = [scheduleBuilder()];

		const attempts = await Promise.all([
			run('create_schedule', { ...brief, executionMode: 'auto_accept' }).catch(() => 'refused'),
			run('update_schedule', {
				scheduleId: testScheduleId(),
				executionMode: 'auto_accept'
			}).catch(() => 'refused')
		]);

		expect([attempts, table.rows]).toEqual([['refused', 'refused'], [scheduleBuilder()]]);
	});

	it('change only the fields an update names', async () => {
		const { table, run } = setup();
		table.rows = [scheduleBuilder()];

		await run('update_schedule', { scheduleId: testScheduleId(), title: 'Daily brief' });

		expect(table.rows).toEqual([scheduleBuilder({ title: 'Daily brief' })]);
	});

	it('start a run of a schedule now through the harness', async () => {
		const { run, runsStarted } = setup();

		await run('run_schedule', { scheduleId: testScheduleId() });

		expect(runsStarted).toEqual([testScheduleId()]);
	});

	it('wait for approval before a change in a chat that asks first, and not before a read', async () => {
		const { surface } = setup('approval_required');
		const asks = async (name: string, input: AgentPayloadObject) => {
			const built = surface.tools().find((candidate) => candidate.name === name) as FunctionTool;
			// The SDK hands a tool its parsed arguments, and each call has its own id.
			return built.needsApproval({} as never, input as never, `call-${name}`);
		};

		expect({
			create: await asks('create_schedule', brief),
			run: await asks('run_schedule', { scheduleId: testScheduleId() }),
			list: await asks('list_schedules', {})
		}).toEqual({ create: true, run: true, list: false });
	});

	it('publish strict JSON Schema parameters, the nested recurrence included', () => {
		const { surface } = setup();
		const published = [...CHANGE_TOOLS, ...READ_TOOLS].map((name) => {
			const definition = surface.definitions().find((candidate) => candidate.name === name);
			return jsonObjectSchema(directTool(definition).parameters).type;
		});

		expect(published).toEqual(Array.from({ length: 9 }, () => 'object'));
	});

	it('are offered to a run a schedule started only for reading', () => {
		const names = (startedBy: 'person' | 'schedule') =>
			setup('auto_accept', startedBy)
				.surface.definitions()
				.map((definition) => definition.name)
				.filter((name) => name.includes('schedule'))
				.toSorted();

		expect({ person: names('person'), schedule: names('schedule') }).toEqual({
			person: [...CHANGE_TOOLS, ...READ_TOOLS].toSorted(),
			schedule: READ_TOOLS
		});
	});
});
