import { describe, expect, it } from 'vitest';
import type { AgentRunResult } from '../lab/run-case';
import { hasSuccessfulReadEvidence, scoreToolCalling } from './tool-calls';

const failedRun: AgentRunResult = {
	runId: '00000000-0000-4000-8000-000000000001' as never,
	conversationId: '00000000-0000-4000-8000-000000000002' as never,
	status: 'completed',
	finalResponse: '',
	toolCalls: [
		{
			callId: 'call-1',
			name: 'search',
			arguments: {},
			failure: 'Project was not found'
		}
	],
	model: 'test/model',
	durationMs: 1,
	events: [],
	calledToolNames: ['search']
};

describe('tool-call scoring diagnostics', () => {
	it('includes the failure text for a failed tool call', () => {
		expect(scoreToolCalling(failedRun, { required: ['search'] })).toEqual({
			passed: false,
			explanation: 'tool failures: search: Project was not found'
		});
	});

	it('requires the expected note and all evidence in one successful search result', () => {
		const evidence = [
			{
				callId: 'call-2',
				name: 'search',
				arguments: {},
				output: [{ noteId: 'runbook-1', content: 'Use the ACME challenge path.' }]
			}
		];
		const unrelated = [
			{
				callId: 'call-3',
				name: 'search',
				arguments: {},
				output: [{ noteId: 'other-1', content: 'Use the ACME challenge path.' }]
			}
		];
		const splitEvidence = [
			{
				callId: 'call-5',
				name: 'search',
				arguments: {},
				output: [
					{ noteId: 'runbook-1', content: 'Check the renewal log.' },
					{ noteId: 'other-1', content: 'Use the ACME challenge path.' }
				]
			}
		];
		const failed = [
			{
				callId: 'call-4',
				name: 'search',
				arguments: {},
				output: [{ noteId: 'runbook-1', content: 'Use the ACME challenge path.' }],
				failure: 'search failed'
			}
		];
		const expectedPath = '/projects/work/notes/runbook-1.md';
		const bodyRead = [
			{
				callId: 'call-6',
				name: 'sed',
				arguments: { path: expectedPath },
				output: { content: 'Use the ACME challenge path.' }
			}
		];
		const wrongPathRead = [
			{
				...bodyRead[0],
				arguments: { path: '/projects/work/notes/other-1.md' }
			}
		];
		expect({
			matchingRead: hasSuccessfulReadEvidence(
				evidence,
				['search', 'grep', 'sed'],
				'runbook-1',
				expectedPath,
				'acme challenge'
			),
			matchingBodyRead: hasSuccessfulReadEvidence(
				bodyRead,
				['search', 'grep', 'sed'],
				'runbook-1',
				expectedPath,
				'acme challenge'
			),
			wrongPathRead: hasSuccessfulReadEvidence(
				wrongPathRead,
				['search', 'grep', 'sed'],
				'runbook-1',
				expectedPath,
				'acme challenge'
			),
			unrelatedNote: hasSuccessfulReadEvidence(
				unrelated,
				['search', 'grep', 'sed'],
				'runbook-1',
				expectedPath,
				'acme challenge'
			),
			splitEvidence: hasSuccessfulReadEvidence(
				splitEvidence,
				['search'],
				'runbook-1',
				expectedPath,
				['renewal log', 'acme challenge']
			),
			failedRead: hasSuccessfulReadEvidence(
				failed,
				['search', 'grep', 'sed'],
				'runbook-1',
				expectedPath,
				'acme challenge'
			)
		}).toEqual({
			matchingRead: true,
			matchingBodyRead: true,
			wrongPathRead: false,
			unrelatedNote: false,
			splitEvidence: false,
			failedRead: false
		});
	});
});
