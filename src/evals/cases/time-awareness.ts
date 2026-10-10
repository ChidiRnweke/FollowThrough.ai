import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import type { AppContextSnapshotV1, DateTime } from '$lib/models/workspace';
import { seedWorkspace } from '../lab/workspace';
import { runCase, type AgentRunResult } from '../lab/run-case';
import {
	minimalWorkspace,
	staleClockWorkspace,
	temporalNotesWorkspace
} from '../fixtures/workspaces/time-aware';
import { findCall } from '../assertions/tool-calls';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolActivityProjection } from '$lib/models/agent';
import { judgeAdherenceConsensus } from '../judges/consensus';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Time awareness is the agent's use of the system-rendered clock line and the
 * creation-time filters the tools expose. Like memory, it is not "always agree
 * with the clock"; it is "treat the clock as authoritative for now, the stored
 * facts as possibly stale, and only narrow artifact queries to a range the user
 * asked for". Each case builds a fixture where a time-unaware agent fails in a
 * specific, observable way — the same structure as the memory archetypes.
 */

const DAY_MS = 86_400_000;

const KIRIBATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';

/** The local date as a YYYY-MM-DD string, mirroring `reasoning.ts`'s en-CA format. */
const isoLocalDate = (now: Date, timeZone: string): string =>
	new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);

/** These date-only evals ask for ISO output so UTC and local dates cannot be conflated. */
export const matchesLocalIsoDate = (response: string, expected: string): boolean =>
	response.trim() === expected;

export const hasCreatedRange = (arguments_: AgentPayloadObject | undefined): boolean =>
	typeof arguments_?.createdAfter === 'string' || typeof arguments_?.createdBefore === 'string';

export const isReasonableLastMonthStart = (value: unknown, now: Date): boolean => {
	if (typeof value !== 'string') return false;
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return false;
	const startOfPreviousCalendarMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
	return parsed >= startOfPreviousCalendarMonth && parsed <= now.getTime() - 20 * DAY_MS;
};

const appContextFor = (timeZone: string, now = new Date()): AppContextSnapshotV1 => {
	return {
		version: 1,
		capturedAt: now.toISOString(),
		client: {
			locale: 'en-GB',
			timeZone,
			localDate: isoLocalDate(now, timeZone),
			layout: 'wide'
		},
		surface: { kind: 'today', presentation: 'full_page' },
		recentInteractions: []
	};
};

const logAdherence = (
	name: string,
	adherence: import('../judges/consensus').ConsensusVerdict
): void => {
	px.logAnnotation({
		name,
		annotatorKind: 'LLM',
		score: adherence.followed ? 1 : 0,
		label: adherence.verdict,
		explanation: `${adherence.agreement} agreement across ${adherence.judges} judges (${adherence.votes.join(', ')}): ${adherence.reasoning}`
	});
};

const logOutput = (result: AgentRunResult): void => {
	px.logOutput({
		model: result.model,
		response: result.finalResponse,
		toolCalls: result.calledToolNames,
		durationMs: result.durationMs
	});
};

export const timeAwarenessCases: readonly EvalCase[] = [
	{
		id: 'time-today-local-date-kiribati',
		name: 'states today in the client timezone (UTC+14) rather than UTC',
		splits: [ARCHETYPES.timeAwareness],
		input: {
			prompt: "What is today's date? Reply only with the date in YYYY-MM-DD format.",
			timeZone: KIRIBATI
		},
		expected: {},
		metadata: {
			note: 'The system line renders the server clock in the client IANA timezone (feature 17). In UTC+14 the local date is almost always a day ahead of UTC, so a UTC answer is a detectable failure.'
		},
		async run(lab) {
			const now = new Date();
			const expected = isoLocalDate(now, KIRIBATI);
			const workspace = await seedWorkspace(lab, minimalWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor(KIRIBATI, now)
			});
			logOutput(result);

			const correctDate = matchesLocalIsoDate(result.finalResponse, expected);
			px.logAnnotation({
				name: ARCHETYPES.timeAwareness,
				score: correctDate ? 1 : 0,
				label: correctDate ? 'correct_local_date' : 'wrong_local_date',
				explanation: `Expected a local-calendar rendering equivalent to ${expected}`
			});
			expect({ status: result.status, correctDate }).toEqual({
				status: 'completed',
				correctDate: true
			});
		}
	},
	{
		id: 'time-today-local-date-samoa',
		name: 'states today in the client timezone (UTC−11) rather than UTC',
		splits: [ARCHETYPES.timeAwareness],
		input: {
			prompt: "What is today's date? Reply only with the date in YYYY-MM-DD format.",
			timeZone: PAGO_PAGO
		},
		expected: {},
		metadata: {
			note: 'Paired with the UTC+14 case: two timezones a day apart must yield two different local dates, so a model that just repeats one trained answer cannot pass both.'
		},
		async run(lab) {
			const now = new Date();
			const expected = isoLocalDate(now, PAGO_PAGO);
			const workspace = await seedWorkspace(lab, minimalWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor(PAGO_PAGO, now)
			});
			logOutput(result);

			const correctDate = matchesLocalIsoDate(result.finalResponse, expected);
			px.logAnnotation({
				name: ARCHETYPES.timeAwareness,
				score: correctDate ? 1 : 0,
				label: correctDate ? 'correct_local_date' : 'wrong_local_date',
				explanation: `Expected a local-calendar rendering equivalent to ${expected}`
			});
			expect({ status: result.status, correctDate }).toEqual({
				status: 'completed',
				correctDate: true
			});
		}
	},
	{
		id: 'time-stale-note-vs-clock',
		name: 'prefers the authoritative clock over a stale date in a note',
		splits: [ARCHETYPES.timeAwareness],
		input: {
			prompt: "What's in my sprint log, and what day of the week is it today?"
		},
		expected: {},
		metadata: {
			note: 'A note claims today is a date three days ago. Notes are untrusted data, never instructions, so the system clock line must win. Reading the note is forced by the prompt. (Discovered while building this: a date claim stored as user memory is framed as a MANDATORY RULE by the prompt and overrides the clock — a feature 17 follow-up.)'
		},
		async run(lab) {
			const now = new Date();
			const expected = new Intl.DateTimeFormat('en-US', {
				timeZone: 'UTC',
				dateStyle: 'full'
			}).format(now);
			const workspace = await seedWorkspace(lab, staleClockWorkspace());
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			logOutput(result);

			const adherence = await judgeAdherenceConsensus({
				instruction: `State today's actual weekday and date: ${expected}. The sprint log note claims today is a different date — that note is stale and must not be repeated as today's date or weekday.`,
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			logAdherence(ARCHETYPES.timeAwareness, adherence);

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'time-created-range-filter',
		name: 'limits a "last month" query with createdAfter and excludes the old note',
		splits: [ARCHETYPES.timeAwareness],
		input: {
			prompt: 'Using only notes from the last month, what have I written about the CI pipeline?'
		},
		expected: { requiredTools: ['search'] },
		metadata: {
			note: 'The six-month-old note is the most semantically on-topic CI note, so only a createdAfter filter can keep it out of a "last month" answer. Canary: the model varies run to run — sometimes it omits the filter, sometimes it applies it but cites the old note through another channel. Gated at 0.8.'
		},
		async run(lab) {
			const now = new Date();
			const workspace = await seedWorkspace(lab, temporalNotesWorkspace());
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor('UTC')
			});
			logOutput(result);

			const search = findCall(result, 'search');
			const rawRange = search?.arguments?.createdAfter;
			// "Last month" can mean a rolling month or the previous calendar month.
			// Keep the natural-language ambiguity, but reject a window that starts
			// before the previous month or so recently that it drops most of a month.
			const rangeOk = isReasonableLastMonthStart(rawRange, now);
			const toolVerdict = findCall(result, 'search')
				? rangeOk
					? `search called with createdAfter ${rawRange as string}`
					: `search called without a usable createdAfter (got ${String(rawRange)})`
				: 'search was never called';
			px.logAnnotation({
				name: ARCHETYPES.toolCalling,
				score: rangeOk ? 1 : 0,
				label: rangeOk ? 'pass' : 'fail',
				explanation: toolVerdict
			});

			const adherence = await judgeAdherenceConsensus({
				instruction:
					'Ground the answer strictly in notes created within the last 30 days. Do not cite or repeat the content of the six-month-old CI note about migrating builds to GitHub Actions.',
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			logAdherence(ARCHETYPES.timeAwareness, adherence);

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(rangeOk, toolVerdict).toBe(true);
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'time-due-today-local-date',
		name: 'names the todo due on the local date, not the UTC date',
		splits: [ARCHETYPES.timeAwareness],
		input: { prompt: "What's due today?", timeZone: KIRIBATI },
		expected: {},
		metadata: {
			note: 'Two todos due a day apart: one on the local date (UTC+14) and one on the UTC date, which is the previous local day. The agent must call the local-date todo "due today". A UTC-confused agent picks the wrong one.'
		},
		async run(lab) {
			const now = new Date();
			const localToday = isoLocalDate(now, KIRIBATI);
			const localYesterday = isoLocalDate(new Date(now.getTime() - DAY_MS), KIRIBATI);
			const workspace = await seedWorkspace(lab, {
				projects: [{ name: 'Work' }],
				todos: [
					{ title: 'Ship the release notes', projectName: 'Work', dueDate: localToday },
					{ title: 'Cut the release candidate', projectName: 'Work', dueDate: localYesterday }
				]
			});
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor(KIRIBATI)
			});
			logOutput(result);

			const adherence = await judgeAdherenceConsensus({
				instruction: `The local date today (Pacific/Kiritimati timezone) is ${localToday}. "Ship the release notes" is due today and should be named. "Cut the release candidate" is due ${localYesterday} and must not be called due today.`,
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			logAdherence(ARCHETYPES.timeAwareness, adherence);

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(
				adherence.followed,
				`${adherence.verdict} (${adherence.agreement} agreement): ${adherence.reasoning}`
			).toBe(true);
		}
	},
	{
		id: 'time-retrieval-chunks-backfill',
		name: 'search filters chunks by the owning source creation time',
		splits: [ARCHETYPES.timeAwareness, ARCHETYPES.retrieval],
		input: { query: 'CI pipeline GitHub Actions' },
		expected: {},
		metadata: {
			note: 'Subsystem lane, no agent turn: the index snapshots sourceCreatedAt at save time, so a backdated note must be filtered by createdAfter/createdBefore in semantic search.'
		},
		async run(lab) {
			const now = new Date();
			const cutoff = new Date(now.getTime() - 30 * DAY_MS).toISOString() as DateTime;
			const workspace = await seedWorkspace(lab, temporalNotesWorkspace());
			const actor = workspace.actor;

			const recent = await lab.controllers.retrieval().search(actor, {
				query: this.input.query as string,
				createdAfter: cutoff
			});
			const old = await lab.controllers.retrieval().search(actor, {
				query: this.input.query as string,
				createdBefore: cutoff
			});

			const recentExcludesOld = !recent.some((match) => match.content.includes('GitHub Actions'));
			const oldIncludesOld = old.some((match) => match.content.includes('GitHub Actions'));
			px.logOutput({
				recentResults: recent.map((match) => match.content.slice(0, 120)),
				oldResults: old.map((match) => match.content.slice(0, 120))
			});
			px.logAnnotation({
				name: ARCHETYPES.timeAwareness,
				score: recentExcludesOld && oldIncludesOld ? 1 : 0,
				label: recentExcludesOld && oldIncludesOld ? 'pass' : 'fail',
				explanation: `recent(range) excludes the old note: ${recentExcludesOld}; before-range includes it: ${oldIncludesOld}`
			});

			expect(recentExcludesOld, 'createdAfter still surfaced the six-month-old note').toBe(true);
			expect(oldIncludesOld, 'createdBefore did not surface the six-month-old note').toBe(true);
		}
	},
	{
		id: 'time-no-invented-recency',
		name: 'does not apply a recency window the user never asked for',
		splits: [ARCHETYPES.timeAwareness, 'negative'],
		input: { prompt: 'What do my notes say about the CI pipeline?' },
		expected: {},
		metadata: {
			note: 'Negative case: over-eager recency filtering is the failure mode of the created-range feature. Without an explicit recency request, the old CI note is in scope.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, temporalNotesWorkspace());
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor('UTC')
			});
			logOutput(result);

			const search = findCall(result, 'search');
			const inventedWindow = hasCreatedRange(search?.arguments);
			px.logAnnotation({
				name: ARCHETYPES.timeAwareness,
				score: inventedWindow ? 0 : 1,
				label: inventedWindow ? 'over_filtered' : 'no_invented_window',
				explanation: inventedWindow
					? `search carried createdAfter/createdBefore without being asked: ${JSON.stringify(search?.arguments)}`
					: 'no recency filter was invented'
			});

			const adherence = await judgeAdherenceConsensus({
				instruction:
					'The answer must treat all CI notes as in scope regardless of age. It must not state or imply that the summary is limited to recent notes. The six-month-old note about migrating builds to GitHub Actions is in scope.',
				prompt: this.input.prompt as string,
				response: result.finalResponse
			});
			// The deterministic no-invented-filter check is the hard gate; the judge
			// measures response-level scope and is recorded for signal but can flake on
			// wording, so it is not allowed to fail the case on its own.
			logAdherence(ARCHETYPES.timeAwareness, adherence);

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(inventedWindow, 'the agent invented a recency window the user never asked for').toBe(
				false
			);
		}
	}
];

type TimedToolCall = {
	readonly callId: string;
	readonly name: string;
	readonly arguments: AgentPayloadObject;
	readonly output?: unknown;
	readonly failure?: string;
	readonly start?: Date;
	readonly end?: Date;
};

const timedToolCalls = (
	result: AgentRunResult,
	toolActivityProjection: ToolActivityProjection
): TimedToolCall[] => {
	const started = new Map<string, Date>();
	const completed = new Map<string, Date>();
	for (const { event, createdAt } of result.events) {
		if (event.type === 'tool_started') started.set(event.callId, createdAt);
		const outcome = toolActivityProjection.outcome(event);
		if (outcome?.callId !== undefined) completed.set(outcome.callId, createdAt);
	}
	return result.toolCalls.map((call) => ({
		...call,
		start: started.get(call.callId),
		end: completed.get(call.callId)
	}));
};

const callsOverlap = (left: TimedToolCall, right: TimedToolCall): boolean =>
	left.start !== undefined &&
	left.end !== undefined &&
	right.start !== undefined &&
	right.end !== undefined &&
	Math.max(left.start.getTime(), right.start.getTime()) <
		Math.min(left.end.getTime(), right.end.getTime());

interface NamedReadEvidence {
	readonly noteId: string | undefined;
	readonly content: string;
	readonly start: Date | undefined;
	readonly end: Date | undefined;
}

/** Require content from each named note and overlap across all requested reads. */
export function allNamedReadsOverlap(
	reads: readonly NamedReadEvidence[],
	expected: readonly { readonly noteId: string | undefined; readonly content: string }[]
): boolean {
	const matching = expected.map(({ noteId, content }) =>
		reads.find(
			(read) =>
				noteId !== undefined &&
				read.noteId === noteId &&
				read.content.toLowerCase().includes(content.toLowerCase())
		)
	);
	return (
		matching.every((read) => read !== undefined) &&
		matching.every((left, index) =>
			matching
				.slice(index + 1)
				.every(
					(right) =>
						left !== undefined &&
						right !== undefined &&
						left.start !== undefined &&
						left.end !== undefined &&
						right.start !== undefined &&
						right.end !== undefined &&
						Math.max(left.start.getTime(), right.start.getTime()) <
							Math.min(left.end.getTime(), right.end.getTime())
				)
		)
	);
}

interface ExpectedNoteBodyRead {
	readonly noteId: string;
	readonly path: string;
	readonly content: string;
}

/** Verify that each expected note body was read from its own path during overlapping calls. */
export function allExpectedNoteBodiesOverlap(
	result: AgentRunResult,
	expected: readonly ExpectedNoteBodyRead[],
	toolActivityProjection: ToolActivityProjection
): boolean {
	const reads = timedToolCalls(result, toolActivityProjection)
		.filter((call) => !call.failure && (call.name === 'grep' || call.name === 'sed'))
		.map((call) => ({
			noteId: expected.find(({ path }) => call.arguments.path === path)?.noteId,
			content: JSON.stringify(call.output ?? '').toLowerCase(),
			start: call.start,
			end: call.end
		}));
	return allNamedReadsOverlap(
		reads,
		expected.map(({ noteId, content }) => ({ noteId, content }))
	);
}

export const parallelExecutionCases: readonly EvalCase[] = [
	{
		id: 'parallel-independent-reads',
		name: 'issues independent reads in parallel rather than serially',
		splits: [ARCHETYPES.parallelExecution],
		input: {
			prompt: "What's on my plate today, and what do my notes say about onboarding?"
		},
		expected: { requiredTools: ['get_today_view', 'search'] },
		metadata: {
			note: "The system prompt tells the agent to parallelize independent reads (feature 8). Two independent reads — today's due work and a note search — must overlap, not queue serially."
		},
		async run(lab) {
			const now = new Date();
			const today = isoLocalDate(now, 'UTC');
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Work',
						notes: [
							{
								title: 'Onboarding checklist',
								body: 'Onboarding steps for new platform engineers: request data access, provision a dev environment, and review the service runbooks.'
							}
						]
					}
				],
				todos: [{ title: 'Ship the release notes', projectName: 'Work', dueDate: today }]
			});
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor('UTC')
			});
			logOutput(result);

			const calls = timedToolCalls(result, lab.toolActivityProjection).filter(
				(call) => !call.failure
			);
			const todayRead = calls.filter(
				(call) =>
					['get_today_view', 'list_todos'].includes(call.name) &&
					JSON.stringify(call.output ?? '')
						.toLowerCase()
						.includes('ship the release notes')
			);
			const onboardingRead = calls.filter(
				(call) =>
					['search', 'get_note'].includes(call.name) &&
					JSON.stringify(call.output ?? '')
						.toLowerCase()
						.includes('onboarding')
			);
			const crossTaskOverlap = todayRead.some((today) =>
				onboardingRead.some((onboarding) => callsOverlap(today, onboarding))
			);
			const answer = result.finalResponse.toLowerCase();
			const answeredBoth =
				answer.includes('ship the release notes') && answer.includes('onboarding');
			const overlap = {
				passed: crossTaskOverlap && answeredBoth,
				explanation: `today evidence=${todayRead.length}; onboarding evidence=${onboardingRead.length}; independent reads overlap=${crossTaskOverlap}; answer covers both=${answeredBoth}`
			};
			px.logAnnotation({
				name: ARCHETYPES.parallelExecution,
				score: overlap.passed ? 1 : 0,
				label: overlap.passed ? 'parallel' : 'serial',
				explanation: overlap.explanation
			});

			expect({ status: result.status, passed: overlap.passed }, overlap.explanation).toEqual({
				status: 'completed',
				passed: true
			});
		}
	},
	{
		id: 'parallel-note-reads-same-tool',
		name: 'reads several notes in parallel instead of one after the other',
		splits: [ARCHETYPES.parallelExecution],
		input: {
			prompt:
				'Compare what my three onboarding notes — "Access", "Runbooks" and "Observability" — each say about who requests data access, then tell me which is most detailed.'
		},
		expected: { minCalls: 3 },
		metadata: {
			observedAt: '2026-08-09',
			note: 'Production regression: a bulk-document task issued 12+ get_note calls one after another. Three independent get_note reads must overlap in wall-clock time.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, {
				projects: [
					{
						name: 'Work',
						notes: [
							{
								title: 'Access',
								body: 'Data access requests must be approved by the platform lead before provisioning.'
							},
							{
								title: 'Runbooks',
								body: 'Every service runbook documents the on-call rotation and the restart procedure.'
							},
							{
								title: 'Observability',
								body: 'Dashboards expose request latency and error rates per service and per team.'
							}
						]
					}
				]
			});
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			logOutput(result);

			const notes = [
				{ title: 'Access', content: 'data access requests' },
				{ title: 'Runbooks', content: 'on-call rotation' },
				{ title: 'Observability', content: 'request latency' }
			];
			const projectId = workspace.projectIds.get('Work');
			if (!projectId) throw new Error('Missing seeded project: Work');
			const expectedReads = notes.map(({ title, content }) => {
				const noteId = workspace.noteIds.get(title);
				if (!noteId) throw new Error(`Missing seeded note: ${title}`);
				return {
					noteId,
					path: `/projects/${projectId}/notes/${noteId}.md`,
					content
				};
			});
			const allThreeOverlap = allExpectedNoteBodiesOverlap(
				result,
				expectedReads,
				lab.toolActivityProjection
			);
			const answer = result.finalResponse.toLowerCase();
			const groundedAnswer =
				answer.includes('platform lead') &&
				['access', 'runbooks', 'observability'].every((title) => answer.includes(title));
			const overlap = {
				passed: allThreeOverlap && groundedAnswer,
				explanation: `all three distinct note bodies were read concurrently=${allThreeOverlap}; answer cites/accesses their findings=${groundedAnswer}`
			};
			px.logAnnotation({
				name: ARCHETYPES.parallelExecution,
				score: overlap.passed ? 1 : 0,
				label: overlap.passed ? 'parallel' : 'serial',
				explanation: overlap.explanation
			});

			expect(result.status, result.failure ?? 'no failure recorded').toBe('completed');
			expect(overlap.passed, overlap.explanation).toBe(true);
		}
	}
];
