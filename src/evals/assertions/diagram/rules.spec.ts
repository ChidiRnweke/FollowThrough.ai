import { describe, expect, it } from 'vitest';
import { edge, mxfile, vertex } from '$lib/testing/diagrams/fixtures/drawio';
import { buildDiagramGraph } from './graph';
import { blemishPoints, blockingFindings } from './finding';
import { checkDiagramRules } from './rules';

/**
 * Every case here is the clean diagram plus exactly one defect, and asserts the
 * fired rules are exactly the one expected. `toContain` would pass a fixture
 * that broke five rules at once and would let a rule quietly stop firing while
 * another covered for it.
 */
const CLEAN = [
	vertex({ id: 'a', value: 'Storefront', x: 0, y: 0, width: 160 }),
	vertex({ id: 'b', value: 'Checkout API', x: 400, y: 0, width: 160 }),
	edge({ id: 'e', source: 'a', target: 'b' })
].join('');

const fired = (body: string): readonly string[] =>
	checkDiagramRules(buildDiagramGraph(mxfile(body))).map((violation) => violation.rule);

describe('a diagram with nothing wrong with it', () => {
	it('breaks no rule', () => {
		expect(fired(CLEAN)).toEqual([]);
	});
});

describe('valid-drawio', () => {
	it('reports source production would refuse rather than measuring it', () => {
		expect(checkDiagramRules(buildDiagramGraph('<mxfile>')).map((item) => item.rule)).toEqual([
			'valid-drawio'
		]);
	});
});

describe('edges-anchored', () => {
	it('catches an arrow pinned to a coordinate instead of a shape', () => {
		expect(
			fired(
				[
					vertex({ id: 'a', value: 'Storefront', x: 0, y: 0, width: 160 }),
					vertex({ id: 'b', value: 'Checkout API', x: 400, y: 0, width: 160 }),
					edge({ id: 'e', source: 'a', targetPoint: { x: 400, y: 30 } })
				].join('')
			)
		).toEqual(['edges-anchored']);
	});
});

describe('vertices-labelled', () => {
	it('catches a shape with no text', () => {
		expect(fired(`${CLEAN}${vertex({ id: 'c', value: '', x: 0, y: 200 })}`)).toEqual([
			'vertices-labelled'
		]);
	});

	it('accepts a logo badge drawn inside a box it is not parented to', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'box', value: 'Azure Blob Storage', x: 0, y: 200, width: 250, height: 100 })}${vertex({ id: 'badge', value: '', x: 20, y: 220, width: 32, height: 32, style: 'shape=image;image=https://api.iconify.design/logos/microsoft-azure.svg;' })}`
			)
		).toEqual([]);
	});

	it('accepts a logo badge inside a container that names it', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'g', value: 'Azure AI Search', x: 0, y: 200, width: 400, height: 300 })}${vertex(
					{
						id: 'badge',
						value: '',
						x: 340,
						y: 10,
						width: 40,
						height: 40,
						parent: 'g',
						style: 'shape=image;image=https://api.iconify.design/logos/microsoft-azure.svg;'
					}
				)}`
			)
		).toEqual([]);
	});

	it('still catches an unlabelled icon dropped beside a separate caption', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'loose', value: '', x: 0, y: 200, width: 40, height: 40, style: 'shape=image;image=https://api.iconify.design/logos/microsoft-azure.svg;' })}`
			)
		).toEqual(['vertices-labelled']);
	});
});

describe('sibling-labels-distinct', () => {
	it('catches two shapes in one container sharing a name', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'c', value: 'Ledger', x: 0, y: 200 })}${vertex({ id: 'd', value: 'Ledger', x: 400, y: 200 })}`
			)
		).toEqual(['sibling-labels-distinct']);
	});
});

describe('no-duplicate-edge', () => {
	it('catches the same connection drawn twice', () => {
		expect(fired(`${CLEAN}${edge({ id: 'f', source: 'a', target: 'b' })}`)).toEqual([
			'no-duplicate-edge'
		]);
	});
});

describe('vertices-do-not-overlap', () => {
	it('catches two shapes stacked on each other', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'c', value: 'Ledger', x: 0, y: 200, width: 160 })}${vertex({ id: 'd', value: 'Notifier', x: 100, y: 200, width: 160 })}`
			)
		).toEqual(['vertices-do-not-overlap']);
	});

	it('does not count a container holding its own child', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'g', value: 'Foundry', x: 0, y: 200, width: 400, height: 300 })}${vertex({ id: 'c', value: 'Model', x: 40, y: 40, parent: 'g' })}`
			)
		).toEqual([]);
	});
});

/**
 * Three findings from the first live run that were the rules' fault, not the
 * agent's. Each is pinned here because each was systematic: they fired on most
 * of the mined architectures at once, and a red suite cannot tell a broken rule
 * from a real defect.
 */
describe('boundary groups drawn without ownership', () => {
	// The agent repeatedly drew a boundary box around its members and left them
	// parented to the layer. That is one defect — the grouping is not owned — and
	// `group-membership` is the check that reports it.
	const drawnAroundButNotOwned = [
		vertex({ id: 'g', value: 'Foundry project', x: 0, y: 200, width: 400, height: 300 }),
		vertex({ id: 'm', value: 'Model', x: 40, y: 240, width: 160 }),
		vertex({ id: 'far', value: 'Search', x: 600, y: 240, width: 160 }),
		edge({ id: 'e', source: 'far', target: 'm' })
	].join('');

	it('is not also reported as two shapes drawn on top of each other', () => {
		expect(fired(drawnAroundButNotOwned)).not.toContain('vertices-do-not-overlap');
	});

	it('does not report the arrow entering the boundary as an obstruction', () => {
		expect(fired(drawnAroundButNotOwned)).not.toContain('edge-clears-vertices');
	});

	it('still catches a genuine partial collision between two shapes', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'c', value: 'Ledger', x: 0, y: 200, width: 160 })}${vertex({ id: 'd', value: 'Notifier', x: 100, y: 200, width: 160 })}`
			)
		).toEqual(['vertices-do-not-overlap']);
	});
});

describe('edge labels', () => {
	// draw.io writes a connector caption as a vertex parented to the edge, with a
	// relative geometry carrying no size. It is not a shape and has no layout.
	const labelledEdge = `${CLEAN}<mxCell id="e-label" value="cart submission" style="edgeLabel;html=1;" vertex="1" connectable="0" parent="e"><mxGeometry relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>`;

	it('are not measured as shapes', () => {
		expect(fired(labelledEdge)).toEqual([]);
	});

	it('lets a shape sit off the grid when it is centred against a taller neighbour', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'tall', value: 'Search', x: 0, y: 300, width: 160, height: 150 })}${vertex({ id: 'short', value: 'Index', x: 300, y: 315, width: 160, height: 120 })}`
			)
		).toEqual([]);
	});
});

describe('children-within-container', () => {
	it('catches a shape parented to a boundary but drawn outside it', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'g', value: 'Foundry', x: 0, y: 200, width: 400, height: 300 })}${vertex({ id: 'c', value: 'Model', x: 380, y: 10, parent: 'g' })}`
			)
		).toEqual(['children-within-container']);
	});
});

describe('positive-extent', () => {
	it('catches a shape with no height', () => {
		expect(fired(`${CLEAN}${vertex({ id: 'c', value: 'Flat', x: 0, y: 200, height: 0 })}`)).toEqual(
			['positive-extent']
		);
	});
});

describe('non-negative-origin', () => {
	it('catches a shape an export would crop', () => {
		expect(fired(`${CLEAN}${vertex({ id: 'c', value: 'Off', x: -200, y: 200 })}`)).toEqual([
			'non-negative-origin'
		]);
	});
});

describe('longest-word-fits', () => {
	it('catches a box narrower than one word of its own label', () => {
		expect(
			fired(`${CLEAN}${vertex({ id: 'c', value: 'Interconnectedness', x: 0, y: 200, width: 40 })}`)
		).toEqual(['longest-word-fits']);
	});
});

describe('edge-clears-vertices', () => {
	it('catches an arrow routed straight through an unrelated shape', () => {
		expect(fired(`${CLEAN}${vertex({ id: 'c', value: 'Blocker', x: 200, y: 0 })}`)).toEqual([
			'edge-clears-vertices'
		]);
	});

	it('does not report an arrow into a zone as crossing what the zone holds', () => {
		expect(
			fired(
				[
					vertex({ id: 'client', value: 'Client', x: 0, y: 300, width: 160 }),
					vertex({ id: 'zone', value: 'Search', x: 400, y: 100, width: 500, height: 500 }),
					vertex({ id: 'index', value: 'Index', x: 140, y: 200, width: 200, parent: 'zone' }),
					edge({ id: 'e', source: 'client', target: 'zone' })
				].join('')
			)
		).toEqual([]);
	});

	it('lets an arrow cross the boundary group it is entering', () => {
		expect(
			fired(
				[
					vertex({ id: 'a', value: 'Storefront', x: 0, y: 0, width: 160 }),
					vertex({ id: 'g', value: 'Foundry', x: 300, y: 0, width: 400, height: 300 }),
					vertex({ id: 'b', value: 'Checkout API', x: 100, y: 100, width: 160, parent: 'g' }),
					edge({ id: 'e', source: 'a', target: 'b' })
				].join('')
			)
		).toEqual([]);
	});
});

describe('orthogonal routing', () => {
	// The straight line between these two is blocked; the L-shaped path around it
	// is clear, and `edgeStyle=orthogonalEdgeStyle` never draws a diagonal.
	const diagonal = [
		vertex({ id: 'a', value: 'Source', x: 0, y: 0, width: 100, height: 100 }),
		vertex({ id: 'b', value: 'Sink', x: 400, y: 300, width: 100, height: 100 }),
		vertex({ id: 'mid', value: 'Bystander', x: 200, y: 150, width: 100, height: 100 }),
		edge({ id: 'e', source: 'a', target: 'b' })
	].join('');

	it('accepts an edge whose corner path clears the obstacle', () => {
		expect(fired(diagonal)).toEqual([]);
	});

	it('still reports a shape sitting on every path between the two ends', () => {
		expect(fired(`${CLEAN}${vertex({ id: 'c', value: 'Blocker', x: 200, y: 0 })}`)).toEqual([
			'edge-clears-vertices'
		]);
	});
});

describe('severity', () => {
	const detached = [
		vertex({ id: 'a', value: 'Storefront', x: 0, y: 0, width: 160 }),
		vertex({ id: 'b', value: 'Checkout API', x: 400, y: 0, width: 160 }),
		edge({ id: 'e', source: 'a', targetPoint: { x: 400, y: 30 } })
	].join('');

	it('treats an arrow that is not attached to a shape as blocking', () => {
		expect(
			blockingFindings(checkDiagramRules(buildDiagramGraph(mxfile(detached)))).map(
				(finding) => finding.rule
			)
		).toEqual(['edges-anchored']);
	});

	// Three boxes at x=0, 100 and 200 with width 160 collide in two pairs: the
	// first and the third do not touch.
	it('charges one point per colliding pair rather than one per rule', () => {
		expect(
			blemishPoints(
				checkDiagramRules(
					buildDiagramGraph(
						mxfile(
							`${CLEAN}${vertex({ id: 'c', value: 'Ledger', x: 0, y: 200, width: 160 })}${vertex({ id: 'd', value: 'Notifier', x: 100, y: 200, width: 160 })}${vertex({ id: 'f', value: 'Mailer', x: 200, y: 200, width: 160 })}`
						)
					)
				)
			)
		).toBe(2);
	});

	it('spends no budget on a diagram with nothing wrong with it', () => {
		expect(blemishPoints(checkDiagramRules(buildDiagramGraph(mxfile(CLEAN))))).toBe(0);
	});
});

describe('step-badges-contiguous', () => {
	it('catches numbered steps that skip a number', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'c', value: '1', x: 0, y: 200, width: 40, height: 40 })}${vertex({ id: 'd', value: '3', x: 100, y: 200, width: 40, height: 40 })}`
			)
		).toEqual(['step-badges-contiguous']);
	});

	it('accepts a complete run of steps', () => {
		expect(
			fired(
				`${CLEAN}${vertex({ id: 'c', value: '1', x: 0, y: 200, width: 40, height: 40 })}${vertex({ id: 'd', value: '2', x: 100, y: 200, width: 40, height: 40 })}`
			)
		).toEqual([]);
	});
});
