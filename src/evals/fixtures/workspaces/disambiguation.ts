import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * Maximum-confusion workspace: two projects with overlapping note and todo names.
 *
 * Designed to test whether the agent targets the CORRECT object when multiple
 * plausible candidates exist. A naive agent that picks the first search result
 * or hallucinates an ID will silently mutate the wrong thing.
 *
 * Layout:
 *   Backend project
 *     ├── "API documentation"     (note about REST endpoints)
 *     ├── "Architecture decisions" (note about service patterns)
 *     └── todos: "Update API documentation", "Fix auth token refresh"
 *
 *   Mobile project
 *     ├── "API documentation"     (note about mobile SDK — SAME NAME!)
 *     ├── "Architecture decisions" (note about app arch — SAME NAME!)
 *     └── todos: "Update API documentation", "Fix push notification delivery"
 *
 * Use composite keys to disambiguate:
 *   noteIds.get('API documentation|Backend')
 *   noteIds.get('API documentation|Mobile')
 *   todoIds.get('Update API documentation|Backend')
 *   todoIds.get('Update API documentation|Mobile')
 */
export const disambiguationWorkspace: WorkspaceFixture = {
	memories: ['Always answer in English.', 'Name: Robin Aldridge, Staff Engineer.'],
	projects: [
		{
			name: 'Backend',
			notes: [
				{
					title: 'API documentation',
					body: [
						'The Backend REST API exposes /users, /orders, and /payments endpoints.',
						'Authentication uses Bearer tokens issued by the auth service.',
						'Rate limiting is applied at the gateway level: 1000 req/min per client.'
					].join('\n\n')
				},
				{
					title: 'Architecture decisions',
					body: [
						'ADR-001: We chose event sourcing for the order lifecycle.',
						'ADR-002: The payment service communicates via async messages, not sync HTTP.',
						'ADR-003: All services deploy to Kubernetes with Helm charts managed in a monorepo.'
					].join('\n\n')
				}
			]
		},
		{
			name: 'Mobile',
			notes: [
				{
					title: 'API documentation',
					body: [
						'The Mobile SDK wraps the GraphQL gateway at /mobile/graphql.',
						'Authentication uses short-lived JWTs with biometric refresh on iOS and Android.',
						'Offline mode caches the last 50 queries in SQLite for instant startup.'
					].join('\n\n')
				},
				{
					title: 'Architecture decisions',
					body: [
						'ADR-001: We use a single shared Kotlin Multiplatform module for business logic.',
						'ADR-002: Navigation follows a coordinator pattern with deep link support.',
						'ADR-003: Push notifications route through Firebase with a custom delivery tracker.'
					].join('\n\n')
				}
			]
		}
	],
	todos: [
		{ title: 'Update API documentation', projectName: 'Backend' },
		{ title: 'Fix auth token refresh', projectName: 'Backend' },
		{ title: 'Update API documentation', projectName: 'Mobile' },
		{ title: 'Fix push notification delivery', projectName: 'Mobile' }
	]
};
