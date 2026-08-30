import type { DiagramFixture } from './fixture';

/**
 * Training and scoring thousands of models: a left-to-right data pipeline.
 *
 * Chosen for the shape rather than the subject. Ingest, train, score, serve is
 * the most conventional diagram in the set, so a failure here is a failure at
 * the easy case.
 */
export const manyModels: DiagramFixture = {
	noteTitle: 'Many models architecture',
	workspace: {
		projects: [
			{
				name: 'Demand forecasting',
				notes: [
					{
						title: 'Many models architecture',
						body: [
							'The many-models system has these parts: the Source database, Azure Data Factory, Azure Data Lake Storage, Azure Machine Learning, Azure DevOps, Azure Synapse Analytics, and Power BI.',
							'Azure Data Factory copies data out of the Source database into Azure Data Lake Storage.',
							'Azure Machine Learning reads the training data from Azure Data Lake Storage and trains one model per dataset in parallel.',
							'Azure DevOps runs the promotion pipeline against Azure Machine Learning, which registers the models that pass the accuracy criteria.',
							'Azure Machine Learning scores the datasets in batch and writes the predictions back to Azure Data Lake Storage.',
							'Azure Data Lake Storage passes the predictions on to Azure Synapse Analytics for serving.',
							'Power BI reads the aggregated predictions from Azure Synapse Analytics and presents them.',
							'Azure Data Factory never talks to Azure Machine Learning, and Power BI never reads Azure Data Lake Storage directly.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Source database',
			'Data Factory',
			'Data Lake Storage',
			'Azure Machine Learning',
			'Azure DevOps',
			'Synapse',
			'Power BI'
		],
		edges: [
			{ from: 'Data Factory', to: 'Data Lake Storage' },
			{ from: 'Data Lake Storage', to: 'Azure Machine Learning' },
			{ from: 'Azure DevOps', to: 'Azure Machine Learning' },
			{ from: 'Azure Machine Learning', to: 'Data Lake Storage' },
			{ from: 'Data Lake Storage', to: 'Synapse' },
			{ from: 'Synapse', to: 'Power BI' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'Data Factory', to: 'Azure Machine Learning' },
			{ from: 'Data Lake Storage', to: 'Power BI' }
		],
		iconBearing: [
			{ component: 'Data Factory', brands: ['azure'] },
			{ component: 'Data Lake Storage', brands: ['azure'] },
			{ component: 'Azure Machine Learning', brands: ['azure'] },
			{ component: 'Azure DevOps', brands: ['azuredevops', 'azure'] },
			{ component: 'Synapse', brands: ['azure', 'synapse'] },
			{ component: 'Power BI', brands: ['powerbi', 'microsoft'] }
		],
		groups: []
	}
};
