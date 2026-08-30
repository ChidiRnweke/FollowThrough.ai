import type { DiagramFixture } from './fixture';

/**
 * Dynamic agent selection at scale: the largest and most nested architecture.
 *
 * A network boundary containing the cluster, a Foundry boundary containing the
 * models, an actor outside both, and egress through a firewall. Nested
 * containers are where absolute geometry stops being a formality: a child of a
 * child resolves through two offsets, and getting that wrong makes every
 * containment answer here wrong at once.
 */
export const agentsAtScale: DiagramFixture = {
	noteTitle: 'Agents at scale architecture',
	workspace: {
		projects: [
			{
				name: 'Assistant platform',
				notes: [
					{
						title: 'Agents at scale architecture',
						body: [
							'The multi-agent system has these parts: the User, Azure Application Gateway, the AI agent service, the Agent factory, Azure AI Search, Azure Managed Redis, Microsoft Foundry, Azure OpenAI, Azure Firewall, and the External APIs.',
							'The User submits a query to Azure Application Gateway.',
							'Azure Application Gateway forwards the request to the AI agent service.',
							'The AI agent service queries Azure AI Search, which acts as the semantic cache and returns the candidate agents.',
							'The AI agent service asks the Agent factory to instantiate the selected agent.',
							'The Agent factory calls Microsoft Foundry to run the agent.',
							'Microsoft Foundry calls the Azure OpenAI model to generate the response.',
							'The AI agent service reads and writes the conversation history in Azure Managed Redis.',
							'The Agent factory reaches the External APIs through Azure Firewall when an agent needs a public endpoint.',
							'Azure Application Gateway, the AI agent service, the Agent factory, and Azure Firewall all run inside the Virtual network.',
							'Microsoft Foundry and the Azure OpenAI model are resources of the Foundry project.',
							'The User never reaches the AI agent service directly, and the Agent factory never calls the External APIs without passing through Azure Firewall.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'User',
			'Application Gateway',
			'AI agent service',
			'Agent factory',
			'AI Search',
			'Managed Redis',
			'Foundry',
			'Azure OpenAI',
			'Azure Firewall',
			'External APIs'
		],
		edges: [
			{ from: 'User', to: 'Application Gateway' },
			{ from: 'Application Gateway', to: 'AI agent service' },
			{ from: 'AI agent service', to: 'AI Search' },
			{ from: 'AI agent service', to: 'Agent factory' },
			{ from: 'Agent factory', to: 'Foundry' },
			{ from: 'Agent factory', to: 'Azure Firewall' },
			{ from: 'Azure Firewall', to: 'External APIs' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'User', to: 'AI agent service' },
			{ from: 'Agent factory', to: 'External APIs' }
		],
		iconBearing: [
			{ component: 'Application Gateway', brands: ['azure'] },
			{ component: 'AI Search', brands: ['azure'] },
			{ component: 'Managed Redis', brands: ['redis'] },
			{ component: 'Azure OpenAI', brands: ['openai', 'azure'] },
			{ component: 'Azure Firewall', brands: ['azure'] }
		],
		groups: [
			{
				boundary: 'Virtual network',
				members: ['Application Gateway', 'AI agent service', 'Agent factory', 'Azure Firewall']
			}
		]
	}
};
