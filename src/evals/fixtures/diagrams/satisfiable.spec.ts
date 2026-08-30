import { describe, expect, it } from 'vitest';
import { edge, mxfile, vertex } from '$lib/testing/diagrams/fixtures/drawio';
import { reviewDiagram } from '../../assertions/diagram/review';
import { searchIndexArchitecture } from './search-index';
import { iotEdgeInference } from './iot-edge-inference';

/**
 * Proof that the oracle can be satisfied.
 *
 * An expectation nobody could ever meet — a component name that can never be a
 * substring of any label, a boundary the rules and the expectations disagree
 * about — makes every case red for a reason that has nothing to do with the
 * agent. That failure is indistinguishable from a real one in a red suite, and
 * this is the only thing that separates them: a diagram drawn by hand, the way
 * a person would draw it, that comes back with nothing wrong.
 *
 * Two fixtures rather than ten, chosen for the two hard parts: the flat case
 * and the case with a container.
 */

const icon = (name: string): string =>
	`shape=image;image=https://api.iconify.design/${name.replace(':', '/')}.svg;verticalLabelPosition=bottom;verticalAlign=top;`;

describe('search index expectations', () => {
	const drawn = mxfile(
		[
			vertex({ id: 'client', value: 'Client application', x: 40, y: 200, width: 160, height: 80 }),
			vertex({
				id: 'blob',
				value: 'Azure Blob Storage',
				x: 320,
				y: 60,
				width: 160,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			vertex({
				id: 'table',
				value: 'Azure Table Storage',
				x: 320,
				y: 340,
				width: 160,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			vertex({
				id: 'search',
				value: 'Azure AI Search',
				x: 640,
				y: 200,
				width: 160,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			edge({ id: 'e1', source: 'blob', target: 'search', value: 'blob indexer' }),
			edge({ id: 'e2', source: 'table', target: 'search', value: 'table indexer' }),
			edge({ id: 'e3', source: 'client', target: 'search', value: 'query' })
		].join('')
	);

	it('are met by a diagram a person would draw', () => {
		expect(reviewDiagram(drawn, searchIndexArchitecture.expectations).findings).toEqual([]);
	});
});

describe('edge inference expectations', () => {
	const drawn = mxfile(
		[
			vertex({
				id: 'aml',
				value: 'Azure Machine Learning',
				x: 40,
				y: 40,
				width: 180,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			vertex({
				id: 'blob',
				value: 'Azure Blob Storage',
				x: 280,
				y: 40,
				width: 180,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			vertex({
				id: 'hub',
				value: 'Azure IoT Hub',
				x: 520,
				y: 40,
				width: 180,
				height: 80,
				style: icon('logos:microsoft-azure')
			}),
			// The device: a container, with its three parts parented to it.
			//
			// The parts are deliberately NOT in one row. Three boxes in a line
			// means the arrow from the first to the third runs straight through
			// the second — which `edge-clears-vertices` catches, correctly, and
			// which is why a real diagram fans them out instead.
			vertex({
				id: 'device',
				value: 'IoT Edge device',
				x: 40,
				y: 240,
				width: 660,
				height: 300,
				style: 'rounded=0;dashed=1;verticalAlign=top;container=1;'
			}),
			vertex({
				id: 'loader',
				value: 'Loader module',
				x: 40,
				y: 60,
				width: 180,
				height: 80,
				parent: 'device'
			}),
			vertex({
				id: 'store',
				value: 'Local model store',
				x: 280,
				y: 60,
				width: 180,
				height: 80,
				parent: 'device'
			}),
			vertex({
				id: 'api',
				value: 'Inference web API',
				x: 280,
				y: 180,
				width: 180,
				height: 80,
				parent: 'device'
			}),
			edge({ id: 'e1', source: 'aml', target: 'blob', value: 'trained model' }),
			edge({ id: 'e2', source: 'hub', target: 'loader', value: 'module twin' }),
			edge({ id: 'e3', source: 'loader', target: 'blob', value: 'download' }),
			edge({ id: 'e4', source: 'loader', target: 'store', value: 'save' }),
			edge({ id: 'e5', source: 'loader', target: 'api', value: 'start' })
		].join('')
	);

	it('are met by a diagram that puts the device parts inside the device', () => {
		expect(reviewDiagram(drawn, iotEdgeInference.expectations).findings).toEqual([]);
	});
});
