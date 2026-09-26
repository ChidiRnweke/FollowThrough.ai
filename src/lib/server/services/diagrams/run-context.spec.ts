import { expect, it } from 'vitest';
import type { AgentRunStatus, WorkflowAgentRun, WorkflowRunContext } from '$lib/models/agent';
import { InMemoryAgentRunPersistence } from '$lib/testing/agent/fakes/in-memory-agent-runs';
import {
	testNoteId,
	testConversationId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { DiagramRunContext } from './run-context';

const run = (
	status: AgentRunStatus = 'running'
): Pick<WorkflowAgentRun, 'status' | 'contextSnapshot'> => ({
	status,
	contextSnapshot: {
		kind: 'diagram_action',
		model: 'test/frozen',
		input: { operation: 'convert', noteId: testNoteId(), source: 'flowchart LR\nA --> B' }
	}
});
const prepared: Extract<WorkflowRunContext, { kind: 'diagram'; state: 'prepared' }> = {
	kind: 'diagram',
	state: 'prepared',
	context: { contextNotes: [], skills: { items: [] } },
	conversationId: testConversationId(),
	effectiveModel: 'test/frozen',
	executionMode: 'auto_accept',
	provenanceId: testProvenanceId(),
	diagramOperation: 'convert'
};

it('keeps the frozen diagram action alongside its prepared context', () => {
	const current = run();
	const contexts = new DiagramRunContext(new InMemoryAgentRunPersistence());
	expect(contexts.prepare(current, prepared, testNow)).toEqual({
		contextSnapshot: {
			...current.contextSnapshot,
			prepared: { context: prepared.context, provenanceId: prepared.provenanceId }
		},
		updatedAt: testNow
	});
});

it('prepares a direct diagram request without introducing a durable action payload', () => {
	const contexts = new DiagramRunContext(new InMemoryAgentRunPersistence());
	expect(
		contexts.prepare(
			{ ...run(), contextSnapshot: { kind: 'diagram', state: 'unprepared', operation: 'convert' } },
			prepared,
			testNow
		)
	).toEqual({ contextSnapshot: prepared, updatedAt: testNow });
});

it.each<AgentRunStatus>([
	'queued',
	'awaiting_approval',
	'cancelling',
	'cancelled',
	'completed',
	'failed'
])('rejects preparation after the authoritative run becomes %s', (status) => {
	const contexts = new DiagramRunContext(new InMemoryAgentRunPersistence());
	expect(() => contexts.prepare(run(status), prepared, testNow)).toThrow('no longer running');
});

it('keeps another workflow kind from being replaced by diagram context', () => {
	const contexts = new DiagramRunContext(new InMemoryAgentRunPersistence());
	expect(() =>
		contexts.prepare(
			{
				...run(),
				contextSnapshot: {
					kind: 'note_action',
					action: 'promises',
					noteId: testNoteId()
				}
			},
			prepared,
			testNow
		)
	).toThrow('does not contain a diagram request');
});
