import { expect, it } from 'vitest';
import { noteBuilder, projectBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { hasReviewContent, visibleReviewFields } from './write-review';

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

it('preserves a false product setting in a note comparison', () => {
	const note = noteBuilder({ isPinned: false });
	expect(visibleReviewFields({ type: 'notes', value: note }, note.title)).toEqual([
		['isPinned', false]
	]);
});
