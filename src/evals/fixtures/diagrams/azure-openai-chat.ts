import type { DiagramFixture } from './fixture';

/**
 * A baseline Azure OpenAI end-to-end chat application.
 *
 * Modelled on the shape Microsoft publishes for this architecture, and chosen as
 * the first case because it exercises every rule at once: branded products that
 * need logos, two nested resource boundaries, a flow that crosses one of them,
 * and an actor outside all of it.
 *
 * The prose states the grouping as a fact of the system — the agent service and
 * the model are resources *of* the project — rather than as a drawing
 * instruction. Expecting a container is then expecting the diagram to express
 * something the source says, not expecting it to follow orders.
 */
export const azureOpenAiChat: DiagramFixture = {
	noteTitle: 'Azure OpenAI chat architecture',
	workspace: {
		projects: [
			{
				name: 'Chat platform',
				notes: [
					{
						title: 'Azure OpenAI chat architecture',
						body: [
							'The chat application runs on Azure and has these parts: the User, App Service, Managed identity, Foundry Agent Service, the Azure OpenAI model, Azure AI Search, Application Insights, and Azure Monitor.',
							'The User opens the chat UI in a browser and sends the request to App Service over HTTPS.',
							'App Service authenticates the user with its own built-in authentication before the application code sees the request.',
							'App Service then calls the Foundry Agent Service, authenticating with a Managed identity rather than a key.',
							'The Foundry Agent Service queries Azure AI Search for the grounding passages that answer the question.',
							'The Foundry Agent Service calls the Azure OpenAI model to write the answer from those passages.',
							'App Service writes traces and metrics to Application Insights and to Azure Monitor. Application Insights and Azure Monitor are the Monitoring components of the system and belong together.',
							'The Foundry Agent Service and the Azure OpenAI model are both resources of the Foundry project, which owns them.',
							'Azure AI Search is provisioned separately and is not a resource of the Foundry project.',
							'The browser never calls the Azure OpenAI model directly, and Azure AI Search never calls the model.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'User',
			'App Service',
			'Managed identity',
			'Foundry Agent Service',
			'Azure OpenAI',
			'Azure AI Search',
			'Application Insights',
			'Azure Monitor'
		],
		edges: [
			{ from: 'User', to: 'App Service' },
			{ from: 'App Service', to: 'Foundry Agent Service' },
			{ from: 'Foundry Agent Service', to: 'Azure AI Search' },
			{ from: 'Foundry Agent Service', to: 'Azure OpenAI' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'User', to: 'Azure OpenAI' },
			{ from: 'Azure AI Search', to: 'Azure OpenAI' }
		],
		/**
		 * Named Azure products, each with the marks that actually identify it.
		 * "azure" is the search term the skill tells the agent to reach for and any
		 * Azure logo reads correctly on the page — but a magnifying glass standing
		 * in for AI Search does not, which is why the brand token is named here
		 * rather than any icon being accepted.
		 */
		iconBearing: [
			{ component: 'App Service', brands: ['azure'] },
			{ component: 'Azure OpenAI', brands: ['openai', 'azure'] },
			{ component: 'Azure AI Search', brands: ['azure'] },
			{ component: 'Application Insights', brands: ['azure', 'applicationinsights'] },
			{ component: 'Azure Monitor', brands: ['azure'] }
		],
		groups: [
			{ boundary: 'Foundry project', members: ['Foundry Agent Service', 'Azure OpenAI'] },
			{ boundary: 'Monitoring', members: ['Application Insights', 'Azure Monitor'] }
		]
	}
};
