import { describe, expect, it } from 'vitest';
import { WidgetEvaluationService } from './edits';
import type { WidgetData, WidgetState } from '$lib/models/widgets';

const evaluation = new WidgetEvaluationService();
const evaluate = (
	source: string,
	data: WidgetData = {},
	derived: Record<string, string> = {}
): WidgetState =>
	evaluation.resolve(
		{
			root: 'text',
			elements: { text: { type: 'Text', props: { text: 'x' }, children: [] } },
			derived: { ...derived, result: source }
		},
		data,
		{}
	);

describe('formula syntax through widget evaluation', () => {
	it('binds a power tighter than a leading minus', () => {
		expect(evaluate('-2 ^ 2').state.derived).toEqual({ result: -4 });
	});
	it('resolves every state pointer a formula reads', () => {
		expect(
			evaluate(
				'@/principal * (1 + @/derived/rate) ^ @/years',
				{ principal: 100, years: 2 },
				{ rate: '0.1' }
			).state.derived
		).toEqual({ rate: 0.1, result: 121.00000000000001 });
	});
	it('reads a field of a referenced row with a dot', () => {
		expect(evaluate('@/rows/0.amount', { rows: [{ amount: 12 }] }).state.derived).toEqual({
			result: 12
		});
	});
	it('lets a series body use its index', () => {
		expect(evaluate('series(1, 3, { year: i })').state.derived).toEqual({
			result: [{ year: 1 }, { year: 2 }, { year: 3 }]
		});
	});
	it('refuses the index outside the body that binds it', () => {
		expect(evaluate('i + 1').issues).toEqual([
			{
				path: '/layout/derived/result',
				message: 'Unknown name "i". Read data with @/path (at character 1)'
			}
		]);
	});
	it('refuses a function the language does not have', () => {
		expect(evaluate('fetch(@/url)').issues.length).toBe(1);
	});
	it('names the arguments a function takes when the count is wrong', () => {
		expect(evaluate('if(true, 1)').issues).toEqual([
			{
				path: '/layout/derived/result',
				message: 'Wrong number of arguments. Use `if(condition, then, else)` (at character 1)'
			}
		]);
	});
	it('says where an unfinished formula stops', () => {
		expect(evaluate('1 +').issues).toEqual([
			{ path: '/layout/derived/result', message: 'The formula ends too early (at character 4)' }
		]);
	});
});
