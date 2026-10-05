import { widgetTemplates } from '$lib/models/widgets';
import { personaWorkspace } from '../workspaces/profile';
import { annuityPayment, BACKGROUND, futureValue, type WidgetScenario } from './scenario';

/** Inputs that change a value: a person moves them and reads the result again. */
const MONTHLY = /monthly|deposit|contribution|saving|per month/i;
const YEARS = /years|term|duration|horizon|period/i;
const RATE = /rate|interest|return/i;

export const savingsSimulator: WidgetScenario = {
	// The id the case had when PR #299 measured it; its baseline stays comparable.
	id: 'effect-widget-savings-simulator',
	name: 'a savings simulator computes, charts, and follows its inputs',
	prompt:
		'In my Background note, add a widget titled "Savings simulator": I start with 5,000, add 200 a month, earn 4% a year, over 15 years. Let me change those numbers, and chart the balance by year.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /savings/i,
	probe: [
		// Monthly and yearly compounding differ by about 2% over fifteen years; either convention
		// is a working simulator, so the first reading allows 3%.
		{
			kind: 'reads',
			label: /balance|total|value/i,
			near: futureValue(5000, 200, 4, 15),
			tolerance: 0.03
		},
		{ kind: 'chart', points: 15 },
		{ kind: 'set', input: MONTHLY, value: 500 },
		{ kind: 'set', input: YEARS, value: 30 },
		{
			kind: 'reads',
			label: /balance|total|value/i,
			near: futureValue(5000, 500, 4, 30),
			tolerance: 0.03
		},
		{ kind: 'chart', points: 30 }
	],
	reference: {
		...widgetTemplates.savings,
		data: { title: 'Savings simulator', start: 5000, monthly: 200, rate: 4, years: 15 }
	}
};

export const loanCalculator: WidgetScenario = {
	id: 'widget-build-loan-calculator',
	name: 'a loan calculator pays off the stated loan and follows a new rate',
	prompt:
		'In my Background note, add a loan calculator widget for a 250,000 mortgage at 4% a year over 25 years, repaid monthly. Show the monthly payment, the total interest, and a chart of the balance left by year. Let me change the amount, the rate and the term.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /loan|mortgage/i,
	probe: [
		{
			kind: 'reads',
			label: /payment|monthly/i,
			near: annuityPayment(250_000, 4, 25),
			tolerance: 0.002
		},
		{
			kind: 'reads',
			label: /interest/i,
			near: annuityPayment(250_000, 4, 25) * 300 - 250_000,
			tolerance: 0.005
		},
		{ kind: 'chart', points: 25 },
		{ kind: 'set', input: RATE, value: 5, percent: true },
		{
			kind: 'reads',
			label: /payment|monthly/i,
			near: annuityPayment(250_000, 5, 25),
			tolerance: 0.002
		},
		{
			kind: 'reads',
			label: /interest/i,
			near: annuityPayment(250_000, 5, 25) * 300 - 250_000,
			tolerance: 0.005
		}
	],
	reference: widgetTemplates.loan
};

/**
 * Assignments 20% at 78 and the midterm 30% at 65, with the final (50%) not sat yet:
 * (0.2·78 + 0.3·65) / 0.5 = 70.2 so far, and (70 − 35.1) / 0.5 = 69.8 needed on the final.
 * A midterm of 80 makes them (15.6 + 24) / 0.5 = 79.2 and (70 − 39.6) / 0.5 = 60.8.
 */
export const gradeCalculator: WidgetScenario = {
	id: 'widget-build-grade-calculator',
	name: 'a grade calculator weighs what is graded and says what the final needs',
	prompt:
		'In my Background note, add a grade calculator widget for my course. Assignments count for 20% of the grade and I scored 78; the midterm counts for 30% and I scored 65; the final exam counts for 50% and I have not taken it yet. Show my weighted average over what is graded so far, and the score I need on the final to finish with 70 overall. Let me edit the scores.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /grade|course/i,
	// 1% lets a grade shown as a whole number pass: 60.8 needed on the final reads "61%".
	probe: [
		{ kind: 'reads', label: /average|so far|current/i, near: 70.2, tolerance: 0.01 },
		{ kind: 'reads', label: /need|required/i, near: 69.8, tolerance: 0.01 },
		{ kind: 'edit', row: /midterm/i, column: /score|grade|mark|result|points/i, value: 80 },
		{ kind: 'reads', label: /average|so far|current/i, near: 79.2, tolerance: 0.01 },
		{ kind: 'reads', label: /need|required/i, near: 60.8, tolerance: 0.01 }
	],
	reference: {
		title: 'Grade calculator',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['table', 'average', 'needed']
				},
				table: {
					type: 'DataTable',
					props: {
						rows: { $bindState: '/parts' },
						columns: [
							{ key: 'name', label: 'Part', kind: 'text' },
							{ key: 'weight', label: 'Weight %', kind: 'number' },
							{ key: 'score', label: 'Score', kind: 'number' },
							{ key: 'graded', label: 'Graded', kind: 'checkbox' }
						]
					},
					children: []
				},
				average: {
					type: 'Metric',
					props: { label: 'Average so far', value: { $state: '/derived/averageText' } },
					children: []
				},
				needed: {
					type: 'Metric',
					props: { label: 'Needed on the final', value: { $state: '/derived/neededText' } },
					children: []
				}
			},
			derived: {
				graded: 'filter(@/parts, item.graded)',
				gradedWeight: 'sum(map(@/derived/graded, item.weight))',
				earned: 'sum(map(@/derived/graded, item.weight * item.score))',
				averageText: 'format(@/derived/earned / @/derived/gradedWeight, 1)',
				neededText:
					'format((@/target * 100 - @/derived/earned) / (100 - @/derived/gradedWeight), 1)'
			}
		},
		data: {
			title: 'Grade calculator',
			target: 70,
			parts: [
				{ name: 'Assignments', weight: 20, score: 78, graded: true },
				{ name: 'Midterm', weight: 30, score: 65, graded: true },
				{ name: 'Final exam', weight: 50, score: 0, graded: false }
			]
		}
	}
};

/** 840 + 1,260 + 315 = 2,415 for four is 603.75 each; five people pay 483; 60 more makes 2,475. */
export const tripSplitter: WidgetScenario = {
	id: 'widget-build-trip-splitter',
	name: 'a trip cost splitter totals the costs and shares them by head',
	prompt:
		"In my Background note, add a trip cost splitter widget for our Lisbon trip: flights 840, apartment 1,260 and car 315, split between 4 people. I want to add costs as they come up and change the number of people. Show the total and each person's share.",
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /trip|lisbon|split/i,
	probe: [
		{ kind: 'reads', label: /total/i, near: 2415 },
		{ kind: 'reads', label: /share|per person|each/i, near: 603.75 },
		{ kind: 'set', input: /people|person|traveller|split|head/i, value: 5 },
		{ kind: 'reads', label: /share|per person|each/i, near: 483 },
		{
			kind: 'addRow',
			cells: [
				{ column: /item|what|description|expense|name|for|cost/i, value: 'Museum passes' },
				{ column: /amount|price|cost|eur|€/i, value: 60 }
			]
		},
		{ kind: 'reads', label: /total/i, near: 2475 },
		{ kind: 'reads', label: /share|per person|each/i, near: 495 }
	],
	reference: {
		title: 'Lisbon trip',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['people', 'costs', 'total', 'share']
				},
				people: {
					type: 'NumberInput',
					props: { label: 'People', value: { $bindState: '/people' }, min: 1 },
					children: []
				},
				costs: {
					type: 'DataTable',
					props: {
						rows: { $bindState: '/costs' },
						columns: [
							{ key: 'item', label: 'Item', kind: 'text' },
							{ key: 'amount', label: 'Amount', kind: 'number' }
						],
						addLabel: 'Add cost',
						removable: true
					},
					children: []
				},
				total: {
					type: 'Metric',
					props: { label: 'Total', value: { $state: '/derived/totalText' } },
					children: []
				},
				share: {
					type: 'Metric',
					props: { label: 'Per person', value: { $state: '/derived/shareText' } },
					children: []
				}
			},
			derived: {
				total: 'sum(map(@/costs, item.amount))',
				totalText: 'format(@/derived/total, 2)',
				shareText: 'format(@/derived/total / @/people, 2)'
			}
		},
		data: {
			title: 'Lisbon trip',
			people: 4,
			costs: [
				{ item: 'Flights', amount: 840 },
				{ item: 'Apartment', amount: 1260 },
				{ item: 'Car', amount: 315 }
			]
		}
	}
};
