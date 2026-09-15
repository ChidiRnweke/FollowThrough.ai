import { describe, expect, it } from 'vitest';
import { workflowRunContextSchema } from './index';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
describe('Workflow context format', () => {
	it('reads the current note-action context', () => {
		const context = { kind: 'note_action', action: 'promises', noteId: testNoteId() };
		expect(workflowRunContextSchema.parse(context)).toEqual(context);
	});
	it('requires the workflow kind on a note-action context', () => {
		expect(
			workflowRunContextSchema.safeParse({ action: 'promises', noteId: testNoteId() }).success
		).toBe(false);
	});
	it('requires the preparation state on a diagram context', () => {
		expect(
			workflowRunContextSchema.safeParse({ kind: 'diagram', operation: 'generate' }).success
		).toBe(false);
	});
});
