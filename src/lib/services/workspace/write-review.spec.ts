import { expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import {
	noteBuilder,
	projectBuilder,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WriteReviewPresentationService } from '$lib/services/workspace/write-review';
const { hasReviewContent, visibleReviewFields, writeGroup } = new WriteReviewPresentationService();

it('omits project identity, storage role and timestamps from the comparison', () => {
	const project = projectBuilder();
	expect(visibleReviewFields({ type: 'projects', value: project }, 'Different title')).toEqual([
		['name', project.name]
	]);
});

it('does not repeat a project name already shown in the review heading', () => {
	const project = projectBuilder();
	expect(hasReviewContent({ type: 'projects', value: project }, project.name)).toBe(false);
});

it('lists a write that resends on its own with the waiting writes, not the decisions', () => {
	const todo = todoBuilder();
	expect(
		writeGroup({
			sequence: 1,
			intent: {
				operationId: 'a0000000-0000-4000-8000-000000000001',
				key: `todos:${todo.id}`,
				command: { kind: 'updateTodo', todoId: todo.id, title: 'Renamed' },
				base: { etag: syncEtag(1n), value: { type: 'todos', value: todo } },
				basedOn: null,
				local: { type: 'todos', value: { ...todo, title: 'Renamed' } },
				coalesce: null,
				dependencies: []
			},
			delivery: { kind: 'retry', message: 'Connection lost' }
		})
	).toBe('waiting');
});

it('preserves a false product setting in a note comparison', () => {
	const note = noteBuilder({ isPinned: false });
	expect(visibleReviewFields({ type: 'notes', value: note }, note.title)).toEqual([
		['isPinned', false]
	]);
});
