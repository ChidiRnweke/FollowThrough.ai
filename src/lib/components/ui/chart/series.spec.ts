import { describe, expect, it } from 'vitest';
import { chartConfigOf, countTick, layerSeriesOf } from './series';

const series = [
	{ key: 'balance', label: 'Balance' },
	{ key: 'deposited', label: 'Deposited' }
];

describe('chart series', () => {
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

describe('colour with a role', () => {
	it('lets a series name its own colour instead of taking the ramp', () => {
		expect(
			chartConfigOf([{ key: 'unread', label: 'Not read yet', color: 'var(--chart-1)' }])
		).toEqual({ unread: { label: 'Not read yet', color: 'var(--chart-1)' } });
	});
});

describe('count ticks', () => {
	it('labels whole counts and leaves fractional ticks blank', () => {
		expect([0, 0.2, 1, 1500].map(countTick)).toEqual(['0', '', '1', '1.5K']);
	});
});
