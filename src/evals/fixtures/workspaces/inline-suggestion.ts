import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * A workspace whose only grounded continuation lives in project memory, not in
 * the passage. A completion that continues the sentence correctly can only have
 * reached that fact through the tier-two briefing pass — which is exactly the
 * grounding path the inline eval exists to exercise.
 */
export const inlineSuggestionWorkspace: WorkspaceFixture = {
	memories: ['The user always writes in British English and prefers short, declarative sentences.'],
	projects: [
		{
			name: 'Platform',
			memories: [
				'The read-replica cutover is owned by Ana Okafor and is scheduled for the last week of Q3.',
				'The migration must preserve zero downtime; the team decided against a maintenance window.'
			],
			notes: [
				{
					title: 'Migration plan',
					body: 'This note tracks the database migration to the new cluster. Open questions remain about the cutover window and who owns it.'
				}
			]
		}
	]
};
