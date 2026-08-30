import { describe, expect, it } from 'vitest';
import { edge, mxfile, vertex } from '$lib/testing/diagrams/fixtures/drawio';
import { buildDiagramGraph } from './graph';
import {
	checkDiagramExpectations,
	type DiagramExpectations,
	type IconManifest
} from './expectations';

const MANIFEST: IconManifest = { collections: { logos: ['microsoft-azure', 'openai'] } };

const NOTHING_EXPECTED: DiagramExpectations = {
	components: [],
	edges: [],
	connections: [],
	forbiddenEdges: [],
	iconBearing: [],
	groups: []
};

const icon = (name: string): string =>
	`shape=image;image=https://api.iconify.design/${name.replace(':', '/')}.svg;`;

const fired = (body: string, expectations: Partial<DiagramExpectations>): readonly string[] =>
	checkDiagramExpectations(
		buildDiagramGraph(mxfile(body)),
		{ ...NOTHING_EXPECTED, ...expectations },
		MANIFEST
	).map((violation) => violation.rule);

const TWO_SERVICES = [
	vertex({ id: 'a', value: 'App Service', x: 0, y: 0, width: 160 }),
	vertex({ id: 'b', value: 'Azure OpenAI model', x: 400, y: 0, width: 200 }),
	edge({ id: 'e', source: 'a', target: 'b' })
].join('');

describe('components-present', () => {
	it('catches a component the source names and the diagram never draws', () => {
		expect(fired(TWO_SERVICES, { components: ['App Service', 'Azure AI Search'] })).toEqual([
			'components-present'
		]);
	});

	it('matches a component named as part of a longer label', () => {
		expect(fired(TWO_SERVICES, { components: ['Azure OpenAI'] })).toEqual([]);
	});
});

describe('required-edges', () => {
	it('catches a stated connection the diagram does not draw', () => {
		expect(
			fired(TWO_SERVICES, { edges: [{ from: 'Azure OpenAI model', to: 'App Service' }] })
		).toEqual(['required-edges']);
	});

	it('accepts the connection drawn in the stated direction', () => {
		expect(
			fired(TWO_SERVICES, { edges: [{ from: 'App Service', to: 'Azure OpenAI model' }] })
		).toEqual([]);
	});
});

describe('a component drawn as a zone holding its own parts', () => {
	// Azure AI Search as a box containing the indexers that do its work, with the
	// arrows landing on those indexers. This is how the published architecture
	// draws it, and demanding a direct zone-to-zone edge failed all three of the
	// connections the diagram actually made.
	const zoned = [
		vertex({ id: 'blob', value: 'Azure Blob Storage', x: 40, y: 40, width: 200 }),
		vertex({ id: 'zone', value: 'Azure AI Search', x: 400, y: 0, width: 400, height: 300 }),
		vertex({ id: 'indexer', value: 'Content indexer', x: 40, y: 60, width: 200, parent: 'zone' }),
		edge({ id: 'e', source: 'blob', target: 'indexer' })
	].join('');

	it('counts an edge into the zone as an edge to the component', () => {
		expect(fired(zoned, { edges: [{ from: 'Azure Blob Storage', to: 'AI Search' }] })).toEqual([]);
	});

	it('holds a forbidden connection to the same standard', () => {
		expect(
			fired(zoned, { forbiddenEdges: [{ from: 'Azure Blob Storage', to: 'AI Search' }] })
		).toEqual(['forbidden-edges']);
	});
});

describe('component matching', () => {
	// "Azure Data Lake Storage\nProduction data" used to win the match for the
	// component "Production" and beat the box actually titled Production, which
	// reported three connections missing on a diagram that drew all three.
	const titled = [
		vertex({ id: 'adls', value: 'Azure Data Lake Storage\\nProduction data', x: 0, y: 0 }),
		vertex({ id: 'prod', value: 'Production\\nScheduled pipelines', x: 400, y: 0 }),
		vertex({ id: 'stg', value: 'Staging\\nIntegration tests', x: 800, y: 0 }),
		edge({ id: 'e', source: 'stg', target: 'prod' })
	].join('');

	it('prefers the component box over a decorative heading that repeats its name', () => {
		expect(
			fired(
				[
					vertex({ id: 'title', value: 'Azure OpenAI chat architecture', x: 0, y: 0, width: 500 }),
					vertex({
						id: 'model',
						value: 'Azure OpenAI model',
						x: 0,
						y: 200,
						style: icon('logos:openai')
					})
				].join(''),
				{ iconBearing: [{ component: 'Azure OpenAI', brands: ['openai', 'azure'] }] }
			)
		).toEqual([]);
	});

	it('prefers the box whose title is the component over a mention in a description', () => {
		expect(fired(titled, { edges: [{ from: 'Staging', to: 'Production' }] })).toEqual([]);
	});
});

describe('connections', () => {
	// "The Loader module downloads the model file from Azure Blob Storage" is true
	// of an arrow drawn either way: one reads as the request, the other as the
	// data coming back.
	const pull = [
		vertex({ id: 'blob', value: 'Azure Blob Storage', x: 0, y: 0 }),
		vertex({ id: 'loader', value: 'Loader module', x: 400, y: 0 }),
		edge({ id: 'e', source: 'blob', target: 'loader', value: 'downloads model file' })
	].join('');

	it('accepts the pair joined in the direction the diagram chose', () => {
		expect(
			fired(pull, { connections: [{ from: 'Loader module', to: 'Azure Blob Storage' }] })
		).toEqual([]);
	});

	it('still reports a pair the diagram never joins at all', () => {
		expect(fired(pull, { connections: [{ from: 'Loader module', to: 'Azure IoT Hub' }] })).toEqual([
			'required-edges'
		]);
	});
});

describe('forbidden-edges', () => {
	it('catches a connection the source rules out', () => {
		expect(
			fired(TWO_SERVICES, { forbiddenEdges: [{ from: 'App Service', to: 'Azure OpenAI model' }] })
		).toEqual(['forbidden-edges']);
	});
});

describe('icons-present', () => {
	it('catches a product drawn as a plain rectangle', () => {
		expect(
			fired(TWO_SERVICES, { iconBearing: [{ component: 'App Service', brands: ['azure'] }] })
		).toEqual(['icons-present']);
	});

	it('catches an image from outside the icon library', () => {
		expect(
			fired(
				vertex({
					id: 'a',
					value: 'App Service',
					style: 'shape=image;image=https://example.test/app.svg;'
				}),
				{ iconBearing: [{ component: 'App Service', brands: ['azure'] }] }
			)
		).toEqual(['icons-present']);
	});

	it('accepts a mark carried by a shape inside the component zone', () => {
		expect(
			fired(
				[
					vertex({ id: 'zone', value: 'Azure AI Search', x: 0, y: 0, width: 400, height: 300 }),
					vertex({
						id: 'index',
						value: 'Search index',
						x: 40,
						y: 60,
						parent: 'zone',
						style: icon('logos:microsoft-azure')
					})
				].join(''),
				{ iconBearing: [{ component: 'AI Search', brands: ['azure'] }] }
			)
		).toEqual([]);
	});

	it('accepts a brand mark from the icon library', () => {
		expect(
			fired(vertex({ id: 'a', value: 'App Service', style: icon('logos:microsoft-azure') }), {
				iconBearing: [{ component: 'App Service', brands: ['azure'] }]
			})
		).toEqual([]);
	});
});

describe('icons-brand-match', () => {
	// The failure this whole expectation exists for: a generic pictogram sitting
	// where a product logo belongs. It passed every earlier version of the check,
	// because the box did carry an icon.
	it('catches a generic pictogram standing in for a product logo', () => {
		expect(
			fired(
				vertex({ id: 'a', value: 'Azure Table Storage', style: icon('material-symbols:table') }),
				{
					iconBearing: [{ component: 'Azure Table Storage', brands: ['azure'] }]
				}
			)
		).toEqual(['icons-brand-match']);
	});

	it('accepts the product mark however the collection spells it', () => {
		expect(
			fired(vertex({ id: 'a', value: 'Power BI', style: icon('simple-icons:powerbi') }), {
				iconBearing: [{ component: 'Power BI', brands: ['power bi'] }]
			})
		).toEqual([]);
	});

	it('accepts any of the marks that legitimately identify one product', () => {
		expect(
			fired(vertex({ id: 'a', value: 'Azure OpenAI', style: icon('logos:openai') }), {
				iconBearing: [{ component: 'Azure OpenAI', brands: ['openai', 'azure'] }]
			})
		).toEqual([]);
	});
});

describe('icons-resolvable', () => {
	it('catches an icon name that does not exist in its library', () => {
		expect(
			fired(vertex({ id: 'a', value: 'App Service', style: icon('logos:azure-app-service') }), {})
		).toEqual(['icons-resolvable']);
	});

	it('leaves a name from a collection nobody harvested alone', () => {
		expect(fired(vertex({ id: 'a', value: 'Database', style: icon('mdi:database') }), {})).toEqual(
			[]
		);
	});
});

describe('group-membership', () => {
	const grouped = [
		vertex({ id: 'g', value: 'Microsoft Foundry project', x: 0, y: 0, width: 400, height: 300 }),
		vertex({ id: 'm', value: 'Azure OpenAI model', x: 40, y: 40, parent: 'g' }),
		vertex({ id: 's', value: 'Azure AI Search', x: 600, y: 0 })
	].join('');

	it('catches a component drawn outside the boundary it belongs to', () => {
		expect(
			fired(grouped, {
				groups: [
					{
						boundary: 'Microsoft Foundry project',
						members: ['Azure OpenAI model', 'Azure AI Search']
					}
				]
			})
		).toEqual(['group-membership']);
	});

	it('accepts a component parented to its boundary', () => {
		expect(
			fired(grouped, {
				groups: [{ boundary: 'Microsoft Foundry project', members: ['Azure OpenAI model'] }]
			})
		).toEqual([]);
	});

	it('catches a boundary the diagram never draws', () => {
		expect(fired(TWO_SERVICES, { groups: [{ boundary: 'Monitoring', members: [] }] })).toEqual([
			'group-membership'
		]);
	});
});
