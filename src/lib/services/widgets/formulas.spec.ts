import { describe, expect, it } from 'vitest';
import { widgetTemplates, type WidgetData, type WidgetLayout } from '$lib/models/widgets';
import { WidgetEvaluationService } from '$lib/services/widgets/edits';
const widgetEvaluation = new WidgetEvaluationService();

const layoutWith = (derived: Record<string, string>): WidgetLayout => ({
	root: 'text',
	elements: { text: { type: 'Text', props: { text: 'x' }, children: [] } },
	derived
});

const derivedOf = (derived: Record<string, string>, data: WidgetData) =>
	widgetEvaluation.resolve(layoutWith(derived), data, {}).state.derived;

describe('resolveWidgetState', () => {
	it('compounds a balance from the data', () => {
		expect(
			derivedOf(
				{ balance: 'round(@/start * (1 + @/rate / 100) ^ @/years, 2)' },
				{
					start: 1000,
					rate: 5,
					years: 2
				}
			)
		).toEqual({ balance: 1102.5 });
	});
	it('reads one derived value from another, in whatever order they are stored', () => {
		expect(derivedOf({ doubled: '@/derived/base * 2', base: '@/n + 1' }, { n: 1 })).toEqual({
			doubled: 4,
			base: 2
		});
	});
	it('builds a schedule of rows with series', () => {
		expect(
			derivedOf({ rows: 'series(1, 3, { year: i, value: i * @/step })' }, { step: 10 })
		).toEqual({
			rows: [
				{ year: 1, value: 10 },
				{ year: 2, value: 20 },
				{ year: 3, value: 30 }
			]
		});
	});
	it('totals one field of a list with map and sum', () => {
		expect(
			derivedOf(
				{ total: 'sum(map(@/expenses, item.amount))' },
				{
					expenses: [{ amount: 12 }, { amount: 30 }]
				}
			)
		).toEqual({ total: 42 });
	});
	it('keeps the items a filter condition holds for', () => {
		expect(
			derivedOf(
				{ open: 'count(filter(@/items, not item.done))' },
				{
					items: [{ done: true }, { done: false }, { done: false }]
				}
			)
		).toEqual({ open: 2 });
	});
	it('groups rows by a field and totals each group', () => {
		expect(
			derivedOf(
				{
					byCategory:
						'map(group(@/rows, "category"), { category: item.key, amount: sum(map(item.items, item.amount)) })'
				},
				{
					rows: [
						{ category: 'Food', amount: 10 },
						{ category: 'Rent', amount: 900 },
						{ category: 'Food', amount: 5 }
					]
				}
			)
		).toEqual({
			byCategory: [
				{ category: 'Food', amount: 15 },
				{ category: 'Rent', amount: 900 }
			]
		});
	});
	it('counts the rows of a source', () => {
		expect(
			widgetEvaluation.resolve(
				{
					...layoutWith({ overdue: 'count(filter(@/sources/todos, item.overdue))' }),
					sources: { todos: { kind: 'todos' } }
				},
				{},
				{ todos: [{ overdue: true }, { overdue: false }, { overdue: true }] }
			).state.derived
		).toEqual({ overdue: 2 });
	});
	it('writes a number as grouped text', () => {
		expect(derivedOf({ shown: '"€" + format(@/n, 2)' }, { n: 1234567.891 })).toEqual({
			shown: '€1,234,567.89'
		});
	});
	it('reads a failed formula as nothing', () => {
		expect(derivedOf({ ratio: '@/a / @/b' }, { a: 1, b: 0 })).toEqual({ ratio: null });
	});
	it('says why a formula failed and which one', () => {
		expect(
			widgetEvaluation.resolve(layoutWith({ ratio: '@/a / @/b' }), { a: 1, b: 0 }, {}).issues
		).toEqual([{ path: '/layout/derived/ratio', message: 'Division by zero' }]);
	});
	it('names the value a formula expected when the data holds something else', () => {
		expect(
			widgetEvaluation.resolve(layoutWith({ next: '@/n * 2' }), { n: 'three' }, {}).issues
		).toEqual([{ path: '/layout/derived/next', message: '* needs a number, not a string' }]);
	});
	it('stops a formula that would take too many steps', () => {
		expect(
			widgetEvaluation.resolve(layoutWith({ huge: 'count(series(1, 1000000, i))' }), {}, {}).issues
		).toEqual([
			{ path: '/layout/derived/huge', message: 'The formulas take too many steps to work out' }
		]);
	});
	it('does not evaluate the branch an if leaves out', () => {
		expect(derivedOf({ safe: 'if(@/b == 0, 0, @/a / @/b)' }, { a: 1, b: 0 })).toEqual({ safe: 0 });
	});
	it('gives a layout without formulas or sources empty computed roots', () => {
		expect(
			widgetEvaluation.resolve({ root: 'text', elements: layoutWith({}).elements }, { n: 1 }, {})
				.state
		).toEqual({ n: 1, sources: {}, derived: {} });
	});
});

describe('the savings template', () => {
	// 10,000 · (1 + 0.05/12)^240 + 250 · ((1 + 0.05/12)^240 − 1) / (0.05/12) = 129,884.82
	it('grows 10,000 with 250 a month at 5% to 129,885 after 20 years', () => {
		const { layout, data } = widgetTemplates.savings;
		expect(widgetEvaluation.resolve(layout, data, {}).state.derived).toMatchObject({
			balanceText: '129,885',
			depositedText: '70,000'
		});
	});
});

describe('the templates', () => {
	it('work out every formula without an issue', () => {
		expect(
			Object.entries(widgetTemplates).flatMap(([name, { layout, data }]) =>
				widgetEvaluation
					.resolve(layout, data, { todos: [], notes: [] })
					.issues.map((issue) => `${name}${issue.path}: ${issue.message}`)
			)
		).toEqual([]);
	});
});

describe('the loan template', () => {
	// 250,000 · r / (1 − (1 + r)^−300), r = 0.04/12
	it('pays 250,000 at 4% over 25 years in monthly payments of 1,319.59', () => {
		const { layout, data } = widgetTemplates.loan;
		expect(widgetEvaluation.resolve(layout, data, {}).state.derived).toMatchObject({
			paymentText: '1,319.59'
		});
	});
});
