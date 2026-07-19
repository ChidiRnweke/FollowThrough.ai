import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * A synthetic persona. Fixtures are committed and shipped to a shared Phoenix
 * instance, so no case uses a real person's details.
 *
 * The profile is deliberately specific — a role, an employer, a location, a
 * tenure — because the agent needs genuine material to answer with. If search
 * returned nothing, a refusal would satisfy an instruction-adherence check for
 * entirely the wrong reason.
 */
export const PERSONA_NAME = 'Robin Aldridge';

export const personaWorkspace: WorkspaceFixture = {
	memories: [
		'Always answer in English.',
		`Name: ${PERSONA_NAME}.`,
		'Role: Staff Platform Engineer.',
		'Based in Utrecht, the Netherlands.',
		'Works at Northwind Analytics as platform lead since March 2023.',
		'Prefers concise, direct answers without filler.'
	],
	projects: [
		{
			name: 'Profile',
			notes: [
				{
					title: 'Background',
					body: [
						`${PERSONA_NAME} is a Staff Platform Engineer with roughly eight years of experience building internal developer platforms and streaming data infrastructure.`,
						'Expertise covers Kubernetes, Terraform, observability tooling, and cost governance for multi-tenant clusters.',
						'Sector experience spans logistics, online retail, and public-sector research funding.',
						'Currently platform lead at Northwind Analytics in Utrecht, owning the internal deployment platform used by nine product teams.'
					].join('\n\n')
				}
			]
		}
	]
};
