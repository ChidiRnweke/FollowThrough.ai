import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * Pre-seeded todos so multi-step cases can test list → update flows without
 * burning an agent turn to create them first.
 */
export const todosWorkspace: WorkspaceFixture = {
	memories: ['Always answer in English.', 'Name: Robin Aldridge.'],
	projects: [
		{
			name: 'Platform',
			notes: [
				{
					title: 'Platform overview',
					body: 'The Platform team owns the internal deployment tooling and Kubernetes clusters.'
				}
			]
		}
	],
	todos: [
		{ title: 'Renew the TLS certificates', projectName: 'Platform' },
		{ title: 'Upgrade Kubernetes to 1.29', projectName: 'Platform' },
		{ title: 'Review Terraform drift report', projectName: 'Platform' }
	]
};
