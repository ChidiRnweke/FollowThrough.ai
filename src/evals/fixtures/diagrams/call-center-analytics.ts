import type { DiagramFixture } from './fixture';

/**
 * Post-call analytics: a batch pipeline, not a request path.
 *
 * Included because the flow is a long single chain. A chain is where an
 * unlucky layout puts a later stage between two earlier ones and routes the
 * arrow straight through it, which is exactly what `edge-clears-vertices` is
 * for.
 */
export const callCentreAnalytics: DiagramFixture = {
	noteTitle: 'Call centre analytics architecture',
	workspace: {
		projects: [
			{
				name: 'Contact centre',
				notes: [
					{
						title: 'Call centre analytics architecture',
						body: [
							'The post-call analytics system has these parts: the Telephony server, Azure Blob Storage, Azure Functions, Azure Speech, Azure Language, Azure OpenAI, and Power BI.',
							'The Telephony server records each call and uploads the audio file to Azure Blob Storage.',
							'A new audio file in Azure Blob Storage triggers Azure Functions, which starts the transcription pipeline.',
							'Azure Functions calls Azure Speech to transcribe the recording in batch.',
							'Azure Speech passes the raw transcript to Azure Language, which detects and redacts personal data.',
							'Azure Language sends the redacted transcript to Azure OpenAI, which extracts call intent, sentiment, and a summary.',
							'Azure OpenAI writes the analytics output back to Azure Blob Storage.',
							'Power BI reads the processed output from Azure Blob Storage and presents it to the business.',
							'The Telephony server never calls Azure OpenAI, and Power BI never reads the raw audio.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Telephony server',
			'Blob Storage',
			'Azure Functions',
			'Azure Speech',
			'Azure Language',
			'Azure OpenAI',
			'Power BI'
		],
		edges: [
			{ from: 'Telephony server', to: 'Blob Storage' },
			{ from: 'Azure Functions', to: 'Azure Speech' },
			{ from: 'Azure Speech', to: 'Azure Language' },
			{ from: 'Azure Language', to: 'Azure OpenAI' },
			{ from: 'Blob Storage', to: 'Power BI' }
		],
		connections: [],
		forbiddenEdges: [{ from: 'Telephony server', to: 'Azure OpenAI' }],
		iconBearing: [
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'Azure Functions', brands: ['azure'] },
			{ component: 'Azure OpenAI', brands: ['openai', 'azure'] },
			{ component: 'Power BI', brands: ['powerbi', 'microsoft'] }
		],
		groups: []
	}
};
