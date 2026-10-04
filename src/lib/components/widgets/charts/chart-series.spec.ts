import { describe, expect, it } from 'vitest';
import { chartConfigOf, layerSeriesOf } from './chart-series';

const series = [
	{ key: 'balance', label: 'Balance' },
	{ key: 'deposited', label: 'Deposited' }
];

describe('widget chart series', () => {
	it('gives the first series the brand teal and the next the neutral ramp', () => {
		expect(chartConfigOf(series)).toEqual({
			balance: { label: 'Balance', color: 'var(--brand)' },
			deposited: { label: 'Deposited', color: 'var(--chart-2)' }
		});
	});
	it('draws each LayerChart series in the colour its config names', () => {
		expect(layerSeriesOf(series).map((entry) => entry.color)).toEqual([
			'var(--color-balance)',
			'var(--color-deposited)'
		]);
	});
});
