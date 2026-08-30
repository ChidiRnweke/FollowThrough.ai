import type { DiagramFixture } from './fixture';

/**
 * Inference on an IoT Edge device: the one architecture with a physical boundary.
 *
 * The edge device is a real container — the loader module, the local model
 * store, and the web API are inside a box that is a piece of hardware, and the
 * cloud services are outside it. A diagram that draws those five things as one
 * flat row has lost the only structural fact the architecture has.
 */
export const iotEdgeInference: DiagramFixture = {
	noteTitle: 'Edge inference architecture',
	workspace: {
		projects: [
			{
				name: 'Field telemetry',
				notes: [
					{
						title: 'Edge inference architecture',
						body: [
							'The edge inference system has these parts: Azure Machine Learning, Azure Blob Storage, Azure IoT Hub, the Loader module, the Local model store, and the Inference web API.',
							'Azure Machine Learning publishes the trained model, and the model file is uploaded to Azure Blob Storage.',
							'Azure IoT Hub syncs the module twin to the device, which tells it a new model is available.',
							'Azure IoT Hub notifies the Loader module of the module twin update.',
							'The Loader module downloads the model file from Azure Blob Storage.',
							'The Loader module saves the model into the Local model store on the device.',
							'The Loader module starts the Inference web API, which accepts a photo and returns detections.',
							'The Loader module, the Local model store, and the Inference web API all run on the IoT Edge device. Azure Machine Learning, Azure Blob Storage, and Azure IoT Hub are cloud services outside it.',
							'The Inference web API never calls Azure Blob Storage directly; only the Loader module downloads models.'
						].join('\n\n')
					}
				]
			}
		]
	},
	expectations: {
		components: [
			'Azure Machine Learning',
			'Blob Storage',
			'IoT Hub',
			'Loader module',
			'Local model store',
			'Inference web API'
		],
		edges: [
			{ from: 'Azure Machine Learning', to: 'Blob Storage' },
			{ from: 'IoT Hub', to: 'Loader module' },
			{ from: 'Loader module', to: 'Local model store' },
			{ from: 'Loader module', to: 'Inference web API' }
		],
		connections: [{ from: 'Loader module', to: 'Blob Storage' }],
		forbiddenEdges: [{ from: 'Inference web API', to: 'Blob Storage' }],
		iconBearing: [
			{ component: 'Azure Machine Learning', brands: ['azure'] },
			{ component: 'Blob Storage', brands: ['azure'] },
			{ component: 'IoT Hub', brands: ['azure'] }
		],
		groups: [
			{
				boundary: 'IoT Edge device',
				members: ['Loader module', 'Local model store', 'Inference web API']
			}
		]
	}
};
