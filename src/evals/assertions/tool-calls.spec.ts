import { describe, expect, it } from 'vitest';
import type { AgentRunResult } from '../lab/run-case';
import { scoreToolCalling } from './tool-calls';

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
});
