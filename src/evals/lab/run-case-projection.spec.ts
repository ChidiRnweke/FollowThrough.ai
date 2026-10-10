import { toolFailure } from '$lib/models/agent/tool-failure';
import { expect, it } from 'vitest';
import type { Lab } from './application';
import { runCase } from './run-case';
import { createToolActivityProjection } from '$lib/server/factories/agent/tool-activity-factory';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { agentSubmissionFixture } from '$lib/testing/agent/fixtures/submission';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';

const fixture = () => {
	const state = agentSubmissionFixture();
	const lab = capabilityDependencies<Lab>({
		controllers: capabilityDependencies<ControllerFactory>({ agent: () => state.controller }),
		eventBus: state.eventBus,
		toolActivityProjection: createToolActivityProjection()
	});
	return { ...state, lab };
};

it('reconstructs concurrent calls in start order with original arguments and failure detail', async () => {
	const state = fixture();
	state.runner.events = [
		{ type: 'tool_started', callId: 'edit', name: 'edit_note', arguments: { noteId: 'note-1' } },
		{ type: 'tool_started', callId: 'read', name: 'get_note', arguments: { noteId: 'note-2' } },
		{ type: 'tool_succeeded', callId: 'read', name: 'get_note', output: false },
		{
			type: 'tool_reported_failure',
			callId: 'edit',
			name: 'edit_note',
			failure: 'No edits',
			output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 })
		},
		{ type: 'tool_failed', name: 'get_note', failure: 'Unidentified call' },
		{ type: 'tool_failed', callId: 'orphan', name: 'get_note', failure: 'Disconnected' },
		{ type: 'text_delta', text: 'Done.' }
	];
	state.release();
	const result = await runCase(state.lab, testActor(), { prompt: 'Read and edit.' });
	expect({
		status: result.status,
		text: result.finalResponse,
		calls: result.toolCalls,
		names: result.calledToolNames
	}).toStrictEqual({
		status: 'completed',
		text: 'Done.',
		calls: [
			{
				callId: 'edit',
				name: 'edit_note',
				arguments: { noteId: 'note-1' },
				failure: 'No edits',
				output: toolFailure('VALIDATION', 'No edits', 'Read the note.', { problems: 1 })
			},
			{ callId: 'read', name: 'get_note', arguments: { noteId: 'note-2' }, output: false },
			{ callId: 'orphan', name: 'get_note', arguments: {}, failure: 'Disconnected' }
		],
		names: ['edit_note', 'get_note', 'get_note']
	});
});

it('reports a parked call as awaiting approval without inventing an outcome', async () => {
	const state = fixture();
	state.runner.outcome = {
		type: 'approval_checkpoint',
		serializedState: 'provider-checkpoint',
		sessionItems: [],
		pendingDecisions: [
			{ callId: 'archive', toolName: 'archive_note', arguments: { noteId: 'note-1' } }
		]
	};
	state.release();
	const result = await runCase(state.lab, testActor(), { prompt: 'Archive the note.' });
	expect({ status: result.status, calls: result.toolCalls }).toStrictEqual({
		status: 'awaiting_approval',
		calls: [
			{
				callId: 'archive',
				name: 'archive_note',
				arguments: { noteId: 'note-1' },
				awaitingApproval: true
			}
		]
	});
});
