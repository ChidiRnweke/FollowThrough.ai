import type { DiagramFixture } from './fixture';

/**
 * MLOps on Databricks, reduced to the three environments and what crosses them.
 *
 * The published version has twelve numbered steps; this states the promotion
 * path and the environment boundaries only. Three sibling containers, each
 * holding real work, is the layout case the other fixtures do not cover — and
 * the one where a diagram most often draws boxes that merely sit near a group
 * rather than inside it.
 */
export const databricksMlops: DiagramFixture = {
	noteTitle: 'Databricks MLOps architecture',
	workspace: {
		projects: [
			{
				name: 'Model platform',
				notes: [
					{
						title: 'Databricks MLOps architecture',
						body: [
							'The MLOps system has these parts: Azure DevOps, Azure Data Lake Storage, Unity Catalog, Azure Monitor, and three Azure Databricks environments named Development, Staging, and Production.',
							'Azure DevOps holds the source control and the release pipelines for all three environments.',
							'A data scientist works in Development, which reads production data from Azure Data Lake Storage in read-only mode.',
							'Azure DevOps promotes the reviewed code from Development to Staging, where the continuous integration tests run.',
							'Azure DevOps promotes the release branch from Staging to Production, where the pipelines run on a schedule.',
							'Production trains the model and registers it in Unity Catalog.',
							'Production loads the current model from Unity Catalog to score new data.',
							'Production writes its monitoring metrics to Azure Monitor.',
							'Development, Staging, and Production are three separate Azure Databricks workspaces.',
							'Development never writes to Unity Catalog, and Staging never writes to Azure Monitor.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Azure DevOps',
			'Data Lake Storage',
			'Unity Catalog',
			'Azure Monitor',
			'Development',
			'Staging',
			'Production'
		],
		edges: [
			{ from: 'Data Lake Storage', to: 'Development' },
			{ from: 'Development', to: 'Staging' },
			{ from: 'Staging', to: 'Production' },
			{ from: 'Production', to: 'Unity Catalog' },
			{ from: 'Production', to: 'Azure Monitor' }
		],
		connections: [],
		forbiddenEdges: [
			{ from: 'Development', to: 'Unity Catalog' },
			{ from: 'Staging', to: 'Azure Monitor' }
		],
		iconBearing: [
			{ component: 'Azure DevOps', brands: ['azuredevops', 'azure'] },
			{ component: 'Data Lake Storage', brands: ['azure'] },
			{ component: 'Azure Monitor', brands: ['azure'] }
		],
		groups: []
	}
};
