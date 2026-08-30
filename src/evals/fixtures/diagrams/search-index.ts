import type { DiagramFixture } from './fixture';

/**
 * The smallest architecture in the set: two sources, one index, one client.
 *
 * Deliberately small. If the rules only ever pass on diagrams with enough room
 * to spread out, they are measuring luck; a four-box diagram has nowhere to hide
 * an overlap or an unanchored arrow.
 */
export const searchIndexArchitecture: DiagramFixture = {
	noteTitle: 'Document search index architecture',
	workspace: {
		projects: [
			{
				name: 'Document search',
				notes: [
					{
						title: 'Document search index architecture',
						body: [
							'The search system has four parts: the Client application, Azure Blob Storage, Azure Table Storage, and Azure AI Search.',
							'Azure Blob Storage holds the documents themselves, along with a small amount of metadata such as the author.',
							'Azure Table Storage holds the larger per-document metadata, such as document type and business impact.',
							'Azure AI Search runs one indexer that reads document content from Azure Blob Storage into the search index.',
							'Azure AI Search runs a second indexer that reads the metadata from Azure Table Storage into the same search index.',
							'The Client application sends search queries to Azure AI Search and receives matching documents.',
							'Azure Blob Storage and Azure Table Storage never talk to each other; both are read only by Azure AI Search.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: ['Client application', 'Blob Storage', 'Table Storage', 'AI Search'],
		edges: [
			{ from: 'Blob Storage', to: 'AI Search' },
			{ from: 'Table Storage', to: 'AI Search' },
			{ from: 'Client application', to: 'AI Search' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'Blob Storage', to: 'Table Storage' },
			{ from: 'Table Storage', to: 'Blob Storage' }
		],
		iconBearing: [
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'Table Storage', brands: ['azure'] },
			{ component: 'AI Search', brands: ['azure'] }
		],
		groups: []
	}
};
