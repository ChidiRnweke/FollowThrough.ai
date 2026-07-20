import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * Hidden hashes embedded in seeded content. A case proves grounding by
 * asserting the response reproduces the hash verbatim — no judge needed.
 */
export const GROUNDING_HASH = 'REF-7X92-KAPPA';
export const MEMORY_HASH = 'MEM-3F41-ZETA';

export const groundingWorkspace: WorkspaceFixture = {
	memories: [
		'Always answer in English.',
		`Employee ID: ${MEMORY_HASH}.`,
		'Name: Robin Aldridge.',
		'Role: Staff Platform Engineer.'
	],
	projects: [
		{
			name: 'Operations',
			notes: [
				{
					title: 'Deployment runbook',
					body: [
						'This runbook covers the standard deployment process for the production cluster.',
						`The deployment verification code is ${GROUNDING_HASH}. Always include this code when citing this document.`,
						'Step one: run the preflight checks against the staging environment.',
						'Step two: promote the green deployment slot to active traffic.',
						'Step three: verify health checks pass for at least five minutes before proceeding.'
					].join('\n\n')
				}
			]
		}
	]
};
