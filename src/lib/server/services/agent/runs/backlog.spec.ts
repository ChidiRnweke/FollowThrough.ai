import { expect, it } from 'vitest';
import type { AgentRunId, ConversationId, WorkflowAgentRun } from '$lib/models/agent';
import type { AgentRunBacklogRepository } from '$lib/server/repositories/agent';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { RunBacklogService } from './backlog';

const queuedWorkflow = (
	suffix: number,
	owner: ReturnType<typeof testActor>,
	contextSnapshot: WorkflowAgentRun['contextSnapshot']
): WorkflowAgentRun => ({
	kind: 'workflow',
	id: `32000000-0000-4000-8000-${String(suffix).padStart(12, '0')}` as AgentRunId,
	conversationId: `33000000-0000-4000-8000-${String(suffix).padStart(12, '0')}` as ConversationId,
	userId: owner.userId,
	status: 'queued',
	model: 'openai/test-model',
	executionMode: 'auto_accept',
	requestId: `backlog-${suffix}`,
	pendingDecisions: [],
	contextSnapshot,
	createdAt: testNow,
	updatedAt: testNow
});

const selection = { noteId: testNoteId(), revision: 1, from: 0, to: 4, text: 'Ship' };

it('names each queued workflow of one kind with the account that submitted it', async () => {
	const promises = queuedWorkflow(1, testActor(), {
		kind: 'promise_extraction',
		generation: { kind: 'rules' },
		selection
	});
	const foreignPromises = queuedWorkflow(2, testActor(2), {
		kind: 'promise_extraction',
		generation: { kind: 'rules' },
		selection
	});
	const references = queuedWorkflow(3, testActor(), {
		kind: 'reference_search',
		model: 'openai/test-model',
		selection
	});
	const backlog = new RunBacklogService(
		capabilityDependencies<AgentRunBacklogRepository>({
			listQueuedWorkflows: async () => [promises, foreignPromises, references]
		})
	);
	expect(await backlog.queuedWorkflowRuns('promise_extraction')).toEqual([
		{ owner: testActor(), runId: promises.id },
		{ owner: testActor(2), runId: foreignPromises.id }
	]);
});
