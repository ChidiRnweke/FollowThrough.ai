import { describe, expect, it } from 'vitest';
import { toPendingMemoryNotifications } from './controller';
import {
	memorySuggestionBuilder,
	projectBuilder,
	suggestionBuilder,
	testProjectId,
	testSuggestionId
} from '$lib/testing/fixtures/domain-builders';

describe('Pending memory notification invariants', () => {
	it('groups profile and project memories into their destinations', () => {
		const project = projectBuilder();
		const notifications = toPendingMemoryNotifications(
			[project],
			[
				memorySuggestionBuilder(),
				memorySuggestionBuilder({ id: testSuggestionId(2) }),
				memorySuggestionBuilder({
					id: testSuggestionId(3),
					payload: { operation: 'add', content: 'Project rule', projectId: testProjectId() }
				})
			]
		);
		expect(notifications).toEqual([
			{ label: 'Profile memory', href: '/profile', count: 2 },
			{
				projectId: project.id,
				label: project.name,
				href: `/projects/${project.id}/memory`,
				count: 1
			}
		]);
	});

	it('ignores non-memory and decided suggestions', () => {
		const notifications = toPendingMemoryNotifications(
			[],
			[
				suggestionBuilder(),
				memorySuggestionBuilder({ status: 'accepted', id: testSuggestionId(2) })
			]
		);
		expect(notifications).toEqual([]);
	});
});
