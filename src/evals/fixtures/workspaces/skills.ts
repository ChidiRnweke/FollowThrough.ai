import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * Hidden hash in the skill body. A case proves the agent loaded and followed
 * the skill instructions by checking the response reproduces this stamp.
 */
export const SKILL_HASH = 'SKL-9D27-OMEGA';

export const skillsWorkspace: WorkspaceFixture = {
	projects: [
		{
			name: 'Audit',
			notes: [
				{
					title: 'Compliance notes',
					body: [
						'All outbound reports must pass a compliance review before distribution.',
						'Reviews are conducted by the legal team on a two-week cadence.',
						'Non-compliant reports are returned with specific remediation guidance.'
					].join('\n\n')
				}
			]
		}
	],
	skills: [
		{
			name: 'Compliance format',
			description: 'Formats responses for compliance review',
			triggerHints: ['compliance', 'format for review', 'audit'],
			body: [
				'# Compliance Format Skill',
				'',
				'When this skill is active, follow these rules:',
				'1. Structure your response as a numbered list of findings.',
				`2. Always end your response with the verification stamp: ${SKILL_HASH}`,
				'3. Do not include disclaimers or hedging language.'
			].join('\n'),
			projectName: 'Audit'
		}
	]
};
