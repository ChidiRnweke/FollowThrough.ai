import { expect, it } from 'vitest';
import { NoteActionEventReader } from './action-event-reader';
import { readAgentRunEventRecord } from '$lib/client/agent/runs/event-reader';
import { suggestionBuilder, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteActionKind } from '$lib/models/agent';

const reader = new NoteActionEventReader();
const read = (action: NoteActionKind, result: object) => {
	const frame: unknown = JSON.parse(
		JSON.stringify({
			kind: 'readable',
			cursor: '2',
			runId: '00000000-0000-4000-8000-000000000001',
			attempt: 1,
			createdAt: new Date(0),
			event: { type: 'workflow_result', action, result }
		})
	);
	const record = readAgentRunEventRecord(frame);
	if (record.kind === 'invalid') throw new Error(record.reason);
	return reader.read(record);
};
it('restores promise suggestions and created todos from the wire representation', () => {
	const suggestion = suggestionBuilder();
	const todo = todoBuilder();
	const record = read('promises', { suggestions: [suggestion], createdTodos: [todo] });
	expect(record.kind === 'readable' ? record.event : record).toEqual({
		type: 'workflow_result',
		result: { action: 'promises', output: { suggestions: [suggestion], createdTodos: [todo] } }
	});
});
it('retains the explicit empty reference outcome', () => {
	const record = read('reference', { outcome: 'nothing_relevant' });
	expect(record.kind === 'readable' ? record.event : record).toEqual({
		type: 'workflow_result',
		result: { action: 'reference', output: { outcome: 'nothing_relevant' } }
	});
});
it('rejects a completed revision without its revised source', () => {
	expect(() => read('revise', { title: 'Missing source' })).toThrow();
});
it('rejects an action result with a malformed saved suggestion', () => {
	expect(() => read('relate', { suggestions: [{ kind: 'todo' }] })).toThrow();
});
