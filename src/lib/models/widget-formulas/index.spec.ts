import { describe, expect, it } from 'vitest';
import { parseFormula } from './index';

describe('parseFormula', () => {
	it('binds a power tighter than a leading minus', () => {
		expect(parseFormula('-2 ^ 2')).toEqual({
			kind: 'parsed',
			formula: {
				kind: 'unary',
				operator: '-',
				operand: {
					kind: 'binary',
					operator: '^',
					left: { kind: 'number', value: 2 },
					right: { kind: 'number', value: 2 }
				}
			},
			references: []
		});
	});
	it('lists every state pointer the formula reads', () => {
		const parsed = parseFormula('@/principal * (1 + @/derived/rate) ^ @/years');
		expect(parsed.kind === 'parsed' && parsed.references).toEqual([
			'/principal',
			'/derived/rate',
			'/years'
		]);
	});
	it('reads a field of a referenced row with a dot', () => {
		expect(parseFormula('@/rows/0.amount')).toEqual({
			kind: 'parsed',
			formula: {
				kind: 'member',
				target: { kind: 'reference', pointer: '/rows/0' },
				field: 'amount'
			},
			references: ['/rows/0']
		});
	});
	it('lets a series body use its index', () => {
		expect(parseFormula('series(1, 3, { year: i })').kind).toBe('parsed');
	});
	it('refuses the index outside the body that binds it', () => {
		expect(parseFormula('i + 1')).toEqual({
			kind: 'failure',
			message: 'Unknown name "i". Read data with @/path (at character 1)'
		});
	});
	it('refuses a function the language does not have', () => {
		expect(parseFormula('fetch(@/url)').kind).toBe('failure');
	});
	it('names the arguments a function takes when the count is wrong', () => {
		expect(parseFormula('if(true, 1)')).toEqual({
			kind: 'failure',
			message: 'Wrong number of arguments. Use `if(condition, then, else)` (at character 1)'
		});
	});
	it('says where an unfinished formula stops', () => {
		expect(parseFormula('1 +')).toEqual({
			kind: 'failure',
			message: 'The formula ends too early (at character 4)'
		});
	});
});
