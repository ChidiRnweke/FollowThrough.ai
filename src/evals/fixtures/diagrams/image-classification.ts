import type { DiagramFixture } from './fixture';

/**
 * An event-driven image pipeline: upload, trigger, analyse, store, display.
 *
 * The forbidden edge here is one the source states outright — the front end
 * receives the classification result and never the image file — so a diagram
 * that draws storage straight to the front end is wrong about the system rather
 * than merely untidy.
 */
export const imageClassification: DiagramFixture = {
	noteTitle: 'Image classification architecture',
	workspace: {
		projects: [
			{
				name: 'Catalogue imaging',
				notes: [
					{
						title: 'Image classification architecture',
						body: [
							'The image pipeline has these parts: Azure Blob Storage, Azure Event Grid, Azure Functions, Azure Content Understanding, Azure Cosmos DB, and the Web app.',
							'A user uploads an image, which lands in Azure Blob Storage.',
							'The upload makes Azure Blob Storage raise an event to Azure Event Grid.',
							'Azure Event Grid notifies Azure Functions that a new image needs processing.',
							'Azure Functions calls Azure Content Understanding, which analyses the image and returns structured labels.',
							'Azure Functions writes those labels and the image metadata to Azure Cosmos DB.',
							'The Web app reads the results from Azure Cosmos DB.',
							'The Web app receives the classification output and metadata only. The original image file never travels from Azure Blob Storage to the Web app.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Blob Storage',
			'Event Grid',
			'Azure Functions',
			'Content Understanding',
			'Cosmos DB',
			'Web app'
		],
		edges: [
			{ from: 'Blob Storage', to: 'Event Grid' },
			{ from: 'Event Grid', to: 'Azure Functions' },
			{ from: 'Azure Functions', to: 'Content Understanding' },
			{ from: 'Azure Functions', to: 'Cosmos DB' },
			{ from: 'Cosmos DB', to: 'Web app' }
		],
		connections: [],
		forbiddenEdges: [{ from: 'Blob Storage', to: 'Web app' }],
		iconBearing: [
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'Event Grid', brands: ['azure'] },
			{ component: 'Azure Functions', brands: ['azure'] },
			{ component: 'Cosmos DB', brands: ['azure', 'cosmos'] }
		],
		groups: []
	}
};
