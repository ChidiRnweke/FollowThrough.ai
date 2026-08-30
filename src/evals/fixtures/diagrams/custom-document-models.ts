import type { DiagramFixture } from './fixture';

/**
 * Building and deploying custom document models: ingest, train, deploy.
 *
 * Two named phases, each holding several alternatives, plus a deployment target
 * outside both. It is the fixture with the most boxes that must be grouped
 * rather than merely arranged.
 */
export const customDocumentModels: DiagramFixture = {
	noteTitle: 'Custom document model architecture',
	workspace: {
		projects: [
			{
				name: 'Claims automation',
				notes: [
					{
						title: 'Custom document model architecture',
						body: [
							'The custom model system has these parts: Azure Logic Apps, Azure Data Factory, Azure Blob Storage, Azure Document Intelligence, Azure Language, Azure Machine Learning, Azure OpenAI, and Azure Kubernetes Service.',
							'Azure Logic Apps ingests documents from email servers and file transfer servers.',
							'Azure Data Factory moves bulk document sets in alongside them.',
							'Azure Logic Apps writes the ingested documents to Azure Blob Storage.',
							'Azure Data Factory also writes its ingested documents to Azure Blob Storage.',
							'Azure Document Intelligence reads the labelled documents from Azure Blob Storage and trains a custom extraction model.',
							'Azure Language reads the same documents from Azure Blob Storage and trains a custom named-entity model.',
							'Azure Machine Learning reads the documents from Azure Blob Storage and trains a model with an open-source framework.',
							'Azure Machine Learning deploys the trained model to Azure Kubernetes Service for inference.',
							'Azure OpenAI is fine-tuned on the same documents from Azure Blob Storage for summarisation.',
							'Azure Logic Apps and Azure Data Factory are the ingestion and orchestration part of the system and belong together.',
							'Azure Document Intelligence, Azure Language, Azure Machine Learning, and Azure OpenAI are the model training part of the system and belong together.',
							'Azure Logic Apps never calls Azure Document Intelligence directly; everything passes through Azure Blob Storage.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Logic Apps',
			'Data Factory',
			'Blob Storage',
			'Document Intelligence',
			'Azure Language',
			'Azure Machine Learning',
			'Azure OpenAI',
			'Kubernetes'
		],
		edges: [
			{ from: 'Logic Apps', to: 'Blob Storage' },
			{ from: 'Data Factory', to: 'Blob Storage' },
			{ from: 'Blob Storage', to: 'Document Intelligence' },
			{ from: 'Blob Storage', to: 'Azure Machine Learning' },
			{ from: 'Azure Machine Learning', to: 'Kubernetes' }
		],
		connections: [],
		forbiddenEdges: [{ from: 'Logic Apps', to: 'Document Intelligence' }],
		iconBearing: [
			{ component: 'Logic Apps', brands: ['azure'] },
			{ component: 'Data Factory', brands: ['azure'] },
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'Azure Machine Learning', brands: ['azure'] },
			{ component: 'Azure OpenAI', brands: ['openai', 'azure'] },
			{ component: 'Kubernetes', brands: ['kubernetes'] }
		],
		groups: [
			{ boundary: 'Ingestion', members: ['Logic Apps', 'Data Factory'] },
			{
				boundary: 'Training',
				members: [
					'Document Intelligence',
					'Azure Language',
					'Azure Machine Learning',
					'Azure OpenAI'
				]
			}
		]
	}
};
