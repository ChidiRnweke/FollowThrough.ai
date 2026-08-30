import type { DiagramFixture } from './fixture';

/**
 * Durable-functions document processing, with a chat surface over the result.
 *
 * The widest fan-out in the set: one orchestrator calling four different
 * services. Fan-out is where a diagram either lays out a clean radial or fan
 * shape, or piles the callees on top of each other.
 */
export const documentClassification: DiagramFixture = {
	noteTitle: 'Document classification architecture',
	workspace: {
		projects: [
			{
				name: 'Records processing',
				notes: [
					{
						title: 'Document classification architecture',
						body: [
							'The document pipeline has these parts: the Web app, Azure Blob Storage, Azure Service Bus, Azure Functions, Azure Document Intelligence, Azure Cosmos DB, Azure AI Search, and the Foundry Agent Service.',
							'A user uploads a scanned file to the Web app.',
							'The Web app stores the uploaded file in Azure Blob Storage.',
							'The Web app puts a command message on Azure Service Bus to start processing.',
							'Azure Service Bus triggers Azure Functions, which orchestrates the whole pipeline.',
							'Azure Functions calls Azure Document Intelligence to split the file and identify each embedded document.',
							'Azure Functions writes the document type, location, and page range for each document to Azure Cosmos DB.',
							'Azure Functions writes the text embeddings and content to Azure AI Search.',
							'The Web app calls the Foundry Agent Service when a user asks a question about the documents.',
							'The Foundry Agent Service queries Azure AI Search to ground its answer in the indexed content.',
							'The Foundry Agent Service never reads Azure Blob Storage directly, and Azure Document Intelligence never writes to Azure AI Search.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Web app',
			'Blob Storage',
			'Service Bus',
			'Azure Functions',
			'Document Intelligence',
			'Cosmos DB',
			'AI Search',
			'Foundry Agent Service'
		],
		edges: [
			{ from: 'Web app', to: 'Blob Storage' },
			{ from: 'Web app', to: 'Service Bus' },
			{ from: 'Service Bus', to: 'Azure Functions' },
			{ from: 'Azure Functions', to: 'Document Intelligence' },
			{ from: 'Azure Functions', to: 'Cosmos DB' },
			{ from: 'Azure Functions', to: 'AI Search' },
			{ from: 'Web app', to: 'Foundry Agent Service' },
			{ from: 'Foundry Agent Service', to: 'AI Search' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'Foundry Agent Service', to: 'Blob Storage' },
			{ from: 'Document Intelligence', to: 'AI Search' }
		],
		iconBearing: [
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'Service Bus', brands: ['azure'] },
			{ component: 'Azure Functions', brands: ['azure'] },
			{ component: 'Document Intelligence', brands: ['azure'] },
			{ component: 'Cosmos DB', brands: ['azure', 'cosmos'] },
			{ component: 'AI Search', brands: ['azure'] }
		],
		groups: []
	}
};
