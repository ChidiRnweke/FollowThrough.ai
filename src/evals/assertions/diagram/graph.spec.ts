import { describe, expect, it } from 'vitest';
import { edge, mxfile, vertex, wrappedVertex } from '$lib/testing/diagrams/fixtures/drawio';
import { buildDiagramGraph, centreOf, parseStyle, type DiagramGraph } from './graph';

const graphOf = (body: string): Extract<DiagramGraph, { kind: 'graph' }> => {
	const graph = buildDiagramGraph(mxfile(body));
	if (graph.kind === 'failure') throw new Error(`fixture did not validate: ${graph.reason}`);
	return graph;
};

describe('style parsing', () => {
	it('reads key-value pairs', () => {
		expect(parseStyle('shape=image;image=https://example.test/a.svg;').get('shape')).toBe('image');
	});

	it('maps a bare token to an empty value', () => {
		expect(parseStyle('rounded;html=1;').get('rounded')).toBe('');
	});
});

describe('vertex reading', () => {
	it('decodes a rich-text label to plain text', () => {
		expect(
			graphOf(vertex({ id: 'a', value: '&lt;b&gt;Checkout&lt;/b&gt; API' })).vertices[0]?.label
		).toBe('Checkout API');
	});

	it('takes the label from a rich-text wrapper when the cell carries none', () => {
		expect(graphOf(wrappedVertex({ id: 'a', value: 'Ledger Service' })).vertices[0]?.label).toBe(
			'Ledger Service'
		);
	});

	it('recognises an icon library image', () => {
		expect(
			graphOf(
				vertex({
					id: 'a',
					value: 'Azure',
					style: 'shape=image;image=https://api.iconify.design/logos/microsoft-azure.svg;'
				})
			).vertices[0]?.image
		).toEqual({
			kind: 'iconify',
			name: 'logos:microsoft-azure',
			url: 'https://api.iconify.design/logos/microsoft-azure.svg'
		});
	});

	it('recognises the colon form the icon library also serves', () => {
		expect(
			graphOf(
				vertex({
					id: 'a',
					value: 'Azure',
					style: 'shape=image;image=https://api.iconify.design/mdi:microsoft-azure.svg;'
				})
			).vertices[0]?.image
		).toEqual({
			kind: 'iconify',
			name: 'mdi:microsoft-azure',
			url: 'https://api.iconify.design/mdi:microsoft-azure.svg'
		});
	});

	it('separates an image from anywhere else', () => {
		expect(
			graphOf(
				vertex({ id: 'a', value: 'Azure', style: 'shape=image;image=https://example.test/a.svg;' })
			).vertices[0]?.image
		).toEqual({ kind: 'other', url: 'https://example.test/a.svg' });
	});

	it('reports no image for a plain rectangle', () => {
		expect(graphOf(vertex({ id: 'a', value: 'Azure' })).vertices[0]?.image).toEqual({
			kind: 'none'
		});
	});

	it('treats a cell with vertex children as a container', () => {
		expect(
			graphOf(
				`${vertex({ id: 'group', value: 'Foundry', width: 400, height: 300 })}${vertex({ id: 'child', value: 'Model', parent: 'group' })}`
			).vertices.find((item) => item.id === 'group')?.isContainer
		).toBe(true);
	});
});

/**
 * The whole builder exists for this. A child's x/y is an offset from its parent
 * vertex, so reading it as a page coordinate puts every grouped shape at the
 * top-left, outside the group that holds it, and every containment and overlap
 * answer downstream is confidently wrong.
 */
describe('absolute geometry', () => {
	it('offsets a child by its container origin', () => {
		expect(
			graphOf(
				`${vertex({ id: 'group', value: 'Foundry', x: 400, y: 200, width: 400, height: 300 })}${vertex(
					{ id: 'child', value: 'Model', x: 40, y: 60 }
				).replace('parent="1"', 'parent="group"')}`
			).vertices.find((item) => item.id === 'child')?.bounds
		).toEqual({ x: 440, y: 260, width: 120, height: 60 });
	});

	it('offsets a grandchild through the whole chain', () => {
		expect(
			graphOf(
				[
					vertex({ id: 'outer', value: 'Foundry', x: 100, y: 100, width: 600, height: 400 }),
					vertex({
						id: 'inner',
						value: 'Project',
						x: 50,
						y: 50,
						width: 400,
						height: 200,
						parent: 'outer'
					}),
					vertex({ id: 'leaf', value: 'Model', x: 10, y: 20, parent: 'inner' })
				].join('')
			).vertices.find((item) => item.id === 'leaf')?.bounds
		).toEqual({ x: 160, y: 170, width: 120, height: 60 });
	});

	it('leaves a top-level shape at its own coordinates', () => {
		expect(graphOf(vertex({ id: 'a', value: 'User', x: 80, y: 40 })).vertices[0]?.bounds).toEqual({
			x: 80,
			y: 40,
			width: 120,
			height: 60
		});
	});

	it('computes a centre from absolute bounds', () => {
		expect(centreOf({ x: 100, y: 200, width: 120, height: 60 })).toEqual({ x: 160, y: 230 });
	});
});

describe('edge ends', () => {
	const two = `${vertex({ id: 'a', value: 'A', x: 0, y: 0 })}${vertex({ id: 'b', value: 'B', x: 400, y: 0 })}`;

	it('attaches an edge that names both cells', () => {
		expect(
			graphOf(`${two}${edge({ id: 'e', source: 'a', target: 'b' })}`).edges[0]?.source
		).toEqual({ kind: 'attached', vertexId: 'a' });
	});

	it('reports a fixed coordinate as floating rather than connected', () => {
		expect(
			graphOf(`${two}${edge({ id: 'e', source: 'a', targetPoint: { x: 400, y: 30 } })}`).edges[0]
				?.target
		).toEqual({ kind: 'floating', point: { x: 400, y: 30 } });
	});

	it('reports an end with neither a cell nor a point as unanchored', () => {
		expect(graphOf(`${two}${edge({ id: 'e', source: 'a' })}`).edges[0]?.target).toEqual({
			kind: 'unanchored'
		});
	});

	// Border to border, not centre to centre: draw.io stops an arrow where it
	// meets the shape, and a route through the middle of its own endpoints sweeps
	// across whatever they contain.
	it('routes an attached edge between the two shapes it joins', () => {
		expect(
			graphOf(
				`${two}${edge({ id: 'e', source: 'a', target: 'b', waypoints: [{ x: 300, y: 30 }] })}`
			).edges[0]?.route
		).toEqual([
			{ x: 120, y: 30 },
			{ x: 300, y: 30 },
			{ x: 400, y: 30 }
		]);
	});

	it('stops an arrow at the boundary it enters rather than at its middle', () => {
		expect(
			graphOf(
				[
					vertex({ id: 'outside', value: 'Client', x: 0, y: 0, width: 100, height: 100 }),
					vertex({ id: 'zone', value: 'Zone', x: 300, y: 0, width: 400, height: 100 }),
					edge({ id: 'e', source: 'outside', target: 'zone' })
				].join('')
			).edges[0]?.route
		).toEqual([
			{ x: 100, y: 50 },
			{ x: 300, y: 50 }
		]);
	});
});

describe('production boundary', () => {
	it('reports malformed source as a failure rather than an empty graph', () => {
		expect(buildDiagramGraph('<mxfile>')).toMatchObject({ kind: 'failure' });
	});
});
