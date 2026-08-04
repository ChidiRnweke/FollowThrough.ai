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

/** A human date like "Saturday, August 1, 2026", what the judge can verify against. */
const longLocalDate = (now: Date, timeZone: string): string =>
	new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full' }).format(now);

const appContextFor = (timeZone: string): AppContextSnapshotV1 => {
	const now = new Date();
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
		input: { prompt: "What is today's date?", timeZone: KIRIBATI },
		expected: {},
		metadata: {
			note: 'The system line renders the server clock in the client IANA timezone (feature 17). In UTC+14 the local date is almost always a day ahead of UTC, so a UTC answer is a detectable failure.'
		},
		async run(lab) {
			const now = new Date();
			const expected = longLocalDate(now, KIRIBATI);
			const workspace = await seedWorkspace(lab, minimalWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor(KIRIBATI)
			});
			logOutput(result);

			const adherence = await judgeAdherenceConsensus({
				instruction: `Answer with today's date: ${expected}. That is the local date for the Pacific/Kiritimati timezone. A UTC date or a date from any other timezone is wrong.`,
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
		id: 'time-today-local-date-samoa',
		name: 'states today in the client timezone (UTC−11) rather than UTC',
		splits: [ARCHETYPES.timeAwareness],
		input: { prompt: "What is today's date?", timeZone: PAGO_PAGO },
		expected: {},
		metadata: {
			note: 'Paired with the UTC+14 case: two timezones a day apart must yield two different local dates, so a model that just repeats one trained answer cannot pass both.'
		},
		async run(lab) {
			const now = new Date();
			const expected = longLocalDate(now, PAGO_PAGO);
			const workspace = await seedWorkspace(lab, minimalWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				appContext: appContextFor(PAGO_PAGO)
			});
			logOutput(result);

			const adherence = await judgeAdherenceConsensus({
				instruction: `Answer with today's date: ${expected}. That is the local date for the Pacific/Pago_Pago timezone. A UTC date or a date from any other timezone is wrong.`,
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
			const expected = longLocalDate(now, 'UTC');
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
			const parsedRange = typeof rawRange === 'string' ? Date.parse(rawRange) : NaN;
			// A "last month" window can reasonably be 30 days back or the start of
			// the previous calendar month (up to ~31 days), so allow 25–40 days.
			const rangeOk =
				Number.isFinite(parsedRange) &&
				parsedRange >= now.getTime() - 40 * DAY_MS &&
				parsedRange <= now.getTime() - 20 * DAY_MS;
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
			const cutoff = new Date(
				now.getTime() - 30 * DAY_MS
			).toISOString() as DateTime;
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
			const inventedWindow = Boolean(
				search?.arguments?.createdAfter !== undefined ||
				search?.arguments?.createdBefore !== undefined
			);
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

/** Execution interval per tool name, from the persisted event log. */
function executionIntervals(result: AgentRunResult): Map<string, { start: Date; end: Date }> {
	const started = new Map<string, Date>();
	const intervals = new Map<string, { start: Date; end: Date }>();
	for (const record of result.events) {
		const { event, createdAt } = record;
		if (event.type === 'tool_started') started.set(event.callId, createdAt);
		if (event.type === 'tool_completed') {
			const start = started.get(event.callId);
			if (start) intervals.set(event.name, { start, end: createdAt });
		}
	}
	return intervals;
}

/**
 * Independent reads must overlap in wall-clock time, not just both be called.
 * Accepts whichever read tools the model chose, so a case is not coupled to one
 * model's tool preference — but it must use at least two of them, and they must
 * run concurrently.
 */
export function anyReadOverlap(
	result: AgentRunResult,
	readToolNames: readonly string[]
): { passed: boolean; explanation: string } {
	const intervals = executionIntervals(result);
	const used = readToolNames.filter((name) => intervals.has(name));
	if (used.length < 2)
		return {
			passed: false,
			explanation: `only ${used.length} independent read tool(s) were used (${used.join(', ') || 'none'}); called ${result.calledToolNames.join(', ')}`
		};
	for (let i = 0; i < used.length; i++) {
		for (let j = i + 1; j < used.length; j++) {
			const left = intervals.get(used[i])!;
			const right = intervals.get(used[j])!;
			const overlap =
				Math.max(left.start.getTime(), right.start.getTime()) <
				Math.min(left.end.getTime(), right.end.getTime());
			if (overlap)
				return {
					passed: true,
					explanation: `${used[i]} and ${used[j]} ran concurrently`
				};
		}
	}
	return { passed: false, explanation: `${used.join(' and ')} ran serially, not in parallel` };
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

			const overlap = anyReadOverlap(result, [
				'get_today_view',
				'list_todos',
				'search',
				'get_note'
			]);
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
