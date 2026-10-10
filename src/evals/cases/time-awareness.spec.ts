import { createToolActivityProjection } from '$lib/server/factories/agent/tool-activity-factory';
import { describe, expect, it } from 'vitest';
import type { AgentRunResult } from '../lab/run-case';
import {
	allExpectedNoteBodiesOverlap,
	hasCreatedRange,
	isReasonableLastMonthStart,
	matchesLocalIsoDate
} from './time-awareness';

describe('time-awareness assertions', () => {
	it('accepts only the requested local ISO date and rejects UTC or contradictory output', () => {
		expect({
			correct: matchesLocalIsoDate(' 2026-08-26\n', '2026-08-26'),
			utc: matchesLocalIsoDate('2026-08-25', '2026-08-26'),
			contradictory: matchesLocalIsoDate('Today is 2026-08-26; UTC is 2026-08-25.', '2026-08-26')
		}).toEqual({ correct: true, utc: false, contradictory: false });
	});

	it('treats nullable structured-output fields as an omitted creation range', () => {
		expect(hasCreatedRange({ createdAfter: null, createdBefore: null })).toBe(false);
	});

	it('detects an active creation range', () => {
		expect(hasCreatedRange({ createdAfter: '2026-07-25T00:00:00Z', createdBefore: null })).toBe(
			true
		);
	});

	it('accepts the previous calendar month as a reading of last month', () => {
		expect(
			isReasonableLastMonthStart('2026-07-01T00:00:00Z', new Date('2026-08-25T12:00:00.000Z'))
		).toBe(true);
	});

	it('rejects a last-month range starting before the previous calendar month', () => {
		expect(
			isReasonableLastMonthStart('2026-06-30T23:59:59Z', new Date('2026-08-25T12:00:00.000Z'))
		).toBe(false);
	});

	it('requires all three requested note bodies to be read from distinct paths in overlapping calls', () => {
		const notes = [
			{ noteId: 'access', path: '/notes/access.md', content: 'data access requests' },
			{ noteId: 'runbooks', path: '/notes/runbooks.md', content: 'on-call rotation' },
			{ noteId: 'observability', path: '/notes/observability.md', content: 'request latency' }
		];
		const run = (paths: readonly string[], intervals: readonly (readonly [number, number])[]) => {
			const runId = '00000000-0000-4000-8000-000000000003' as never;
			const toolCalls = paths.map((path, index) => ({
				callId: `call-${index}`,
				name: 'sed',
				arguments: { path },
				output: { content: notes.find((note) => note.path === path)?.content ?? '' }
			}));
			const events = toolCalls.flatMap((call, index) => {
				const [start, end] = intervals[index];
				const name = 'sed' as const;
				return [
					{
						cursor: `${index}-start`,
						runId,
						attempt: 1,
						createdAt: new Date(start),
						event: {
							type: 'tool_started' as const,
							callId: call.callId,
							name,
							arguments: call.arguments
						}
					},
					{
						cursor: `${index}-end`,
						runId,
						attempt: 1,
						createdAt: new Date(end),
						event: { type: 'tool_succeeded' as const, callId: call.callId, name }
					}
				];
			});
			return {
				runId,
				conversationId: '00000000-0000-4000-8000-000000000004' as never,
				status: 'completed' as const,
				finalResponse: '',
				toolCalls,
				model: 'test/model',
				durationMs: 1,
				events,
				calledToolNames: toolCalls.map((call) => call.name)
			} satisfies AgentRunResult;
		};
		const expectedPaths = notes;
		const positive = run(
			notes.map((note) => note.path),
			[
				[0, 8],
				[2, 9],
				[3, 7]
			]
		);
		const duplicatePath = run(
			[notes[0].path, notes[0].path, notes[2].path],
			[
				[0, 8],
				[1, 7],
				[3, 9]
			]
		);
		const serialThird = run(
			notes.map((note) => note.path),
			[
				[0, 8],
				[2, 9],
				[10, 17]
			]
		);
		expect({
			valid: allExpectedNoteBodiesOverlap(positive, expectedPaths, createToolActivityProjection()),
			duplicatePath: allExpectedNoteBodiesOverlap(
				duplicatePath,
				expectedPaths,
				createToolActivityProjection()
			),
			serialThirdRead: allExpectedNoteBodiesOverlap(
				serialThird,
				expectedPaths,
				createToolActivityProjection()
			)
		}).toEqual({ valid: true, duplicatePath: false, serialThirdRead: false });
	});
});
