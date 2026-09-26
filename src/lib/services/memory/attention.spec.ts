import { describe, expect, it } from 'vitest';
import { pendingMemoryNotifications } from './attention';
import {
	memorySuggestionBuilder,
	projectBuilder,
	suggestionBuilder,
	testProjectId,
	testNow,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';

describe('Pending memory notification invariants', () => {
	it('omits archived projects without treating their proposals as profile memory', () => {
		const project = projectBuilder({ archivedAt: testNow });
		const suggestion = memorySuggestionBuilder({
			payload: {
				scope: 'project',
				operation: 'add',
				content: 'Project fact',
				projectId: project.id
			}
		});
		expect(pendingMemoryNotifications([project], [suggestion])).toEqual([]);
	});
	it('keeps profile attention when the project inventory is incomplete', () => {
		const projectSuggestion = memorySuggestionBuilder({
			id: testSuggestionId(2),
			payload: {
				scope: 'project',
				operation: 'add',
				content: 'Project fact',
				projectId: testProjectId()
			}
		});
		expect(pendingMemoryNotifications([], [memorySuggestionBuilder(), projectSuggestion])).toEqual([
			{ label: 'Profile memory', href: '/profile', count: 1 }
		]);
	});
	it('groups profile and project memories into their destinations', () => {
		const project = projectBuilder();
		const notifications = pendingMemoryNotifications(
			[project],
			[
				memorySuggestionBuilder(),
				memorySuggestionBuilder({ id: testSuggestionId(2) }),
				memorySuggestionBuilder({
					id: testSuggestionId(3),
					payload: {
						scope: 'project',
						operation: 'add',
						content: 'Project rule',
						projectId: testProjectId()
					}
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
		const notifications = pendingMemoryNotifications(
			[],
			[
				suggestionBuilder(),
				memorySuggestionBuilder({ status: 'accepted', id: testSuggestionId(2) })
			]
		);
		expect(notifications).toEqual([]);
	});
});
