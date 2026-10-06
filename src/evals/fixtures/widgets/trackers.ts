import { widgetTemplates } from '$lib/models/widgets';
import { personaWorkspace } from '../workspaces/profile';
import { BACKGROUND, TICKED, UNTICKED, type WidgetScenario } from './scenario';

const SPENT = /spent|total/i;
const LEFT = /left|remaining|remains/i;

/** 1,200 + 182.50 + 64 = 1,446.50 of 2,000; a 58 dinner makes 1,504.50, with 240.50 on food. */
export const expenseTracker: WidgetScenario = {
	id: 'widget-build-expense-tracker',
	name: 'an expense tracker totals rows a person adds and ticks',
	prompt:
		'In my Background note, add an expense tracker widget with a monthly budget of 2,000. Start it with: Rent (Housing) 1,200, paid; Groceries (Food) 182.50, paid; Train pass (Transport) 64, not paid yet. I want to add expenses as they come in and tick what is paid. Show the total of all expenses, paid or not, what is left of the budget after them, and a chart of spending by category.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /expense|budget|spend/i,
	probe: [
		{ kind: 'reads', label: SPENT, near: 1446.5 },
		{ kind: 'reads', label: LEFT, near: 553.5 },
		{ kind: 'chart', points: 3 },
		{
			kind: 'addRow',
			cells: [
				{ column: /item|expense|description|name|what/i, value: 'Dinner out' },
				{ column: /category/i, value: 'Food' },
				{ column: /amount|cost|price/i, value: 58 }
			]
		},
		{ kind: 'reads', label: SPENT, near: 1504.5 },
		{ kind: 'reads', label: LEFT, near: 495.5 },
		{ kind: 'reads', label: /food/i, near: 240.5 },
		{ kind: 'edit', row: /train pass/i, column: /paid/i, value: true },
		{ kind: 'says', label: /train pass/i, text: TICKED }
	],
	reference: widgetTemplates.expenses
};

const CHECK_INS = /check|week|done|complet|progress|total/i;

/** Two habits over seven days is 14 possible check-ins; three ticks read "3 of 14". */
export const habitTracker: WidgetScenario = {
	id: 'widget-build-habit-tracker',
	name: 'a habit tracker counts the days a person ticks',
	prompt:
		'In my Background note, add a habit tracker widget for this week with two habits, "Write 30 minutes" and "No meetings before 10", and one tick box per day from Monday to Sunday. Nothing is ticked yet. Show how many check-ins I have done out of the possible ones, and a chart of days done per habit.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /habit/i,
	probe: [
		{ kind: 'edit', row: /write 30/i, column: /^mon/i, value: true },
		{ kind: 'edit', row: /write 30/i, column: /^tue/i, value: true },
		{ kind: 'edit', row: /no meetings/i, column: /^mon/i, value: true },
		{ kind: 'reads', label: CHECK_INS, near: 3, tolerance: 0 },
		{ kind: 'says', label: CHECK_INS, text: /\b14\b/ },
		{ kind: 'chart', points: 2 }
	],
	reference: {
		...widgetTemplates.habits,
		data: {
			title: 'Habit tracker',
			habits: ['Write 30 minutes', 'No meetings before 10'].map((name) => ({
				name,
				mon: false,
				tue: false,
				wed: false,
				thu: false,
				fri: false,
				sat: false,
				sun: false
			}))
		}
	}
};

/** The PR's first example: a list a person grows and ticks. */
export const relocationChecklist: WidgetScenario = {
	id: 'widget-build-checklist',
	name: 'a checklist grows and keeps the ticks a person sets',
	prompt:
		'In my Background note, add a checklist widget titled "Relocation" with three items: book movers, update address, cancel lease. I want to add more items to it later.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /relocation/i,
	probe: [
		{ kind: 'mentions', text: /book movers/i },
		{ kind: 'mentions', text: /cancel lease/i },
		{ kind: 'addItem', input: /item|step|task|new|add/i, text: 'Transfer utilities' },
		{ kind: 'mentions', text: /transfer utilities/i },
		{ kind: 'edit', row: /update address/i, value: true },
		{ kind: 'says', label: /update address/i, text: TICKED },
		{ kind: 'says', label: /book movers/i, text: UNTICKED }
	],
	reference: {
		...widgetTemplates.checklist,
		title: 'Relocation',
		data: {
			title: 'Relocation',
			draft: '',
			items: [
				{ id: 'movers', label: 'Book movers', done: false },
				{ id: 'address', label: 'Update address', done: false },
				{ id: 'lease', label: 'Cancel lease', done: false }
			]
		}
	}
};

/**
 * Progress from start to target: lead time 120 → 30 minutes, now 75, is 50%; failure rate
 * 15 → 5%, now 11, is 40%; weekly deploys 10 → 40, now 22, is 40%. The average is 43.3%.
 * Reaching the lead-time target makes it (100 + 40 + 40) / 3 = 60%.
 */
export const okrTracker: WidgetScenario = {
	id: 'widget-build-okr-tracker',
	name: 'an OKR tracker measures progress from start to target, either direction',
	prompt:
		'In my Background note, add an OKR tracker widget for the objective "Make deploys boring". Key results: deploy lead time from 120 to 30 minutes (now 75), change failure rate from 15% to 5% (now 11%), and weekly deploys from 10 to 40 (now 22). Show the progress of each key result and the overall progress as their average. Let me update the current values.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /okr|deploys boring|objective/i,
	probe: [
		{
			kind: 'reads',
			label: /overall|objective|average/i,
			near: 43.33,
			tolerance: 0.02,
			percent: true
		},
		{ kind: 'edit', row: /lead time/i, column: /current|now|actual|value/i, value: 30 },
		{ kind: 'reads', label: /overall|objective|average/i, near: 60, tolerance: 0.02, percent: true }
	],
	reference: {
		title: 'Make deploys boring',
		layout: {
			root: 'card',
			elements: {
				card: {
					type: 'Card',
					props: { title: { $state: '/title' } },
					children: ['overall', 'table', 'bars']
				},
				overall: {
					type: 'Metric',
					props: { label: 'Overall progress %', value: { $state: '/derived/overallText' } },
					children: []
				},
				table: {
					type: 'DataTable',
					props: {
						rows: { $bindState: '/results' },
						columns: [
							{ key: 'name', label: 'Key result', kind: 'text' },
							{ key: 'start', label: 'Start', kind: 'number' },
							{ key: 'target', label: 'Target', kind: 'number' },
							{ key: 'current', label: 'Current', kind: 'number' }
						]
					},
					children: []
				},
				bars: {
					type: 'BarChart',
					props: {
						title: 'Progress per key result',
						rows: { $state: '/derived/progress' },
						x: 'name',
						series: [{ key: 'percent', label: 'Progress %' }]
					},
					children: []
				}
			},
			derived: {
				progress:
					'map(@/results, { name: item.name, percent: round(max(0, min(100, (item.current - item.start) / (item.target - item.start) * 100))) })',
				overall:
					'sum(map(@/results, max(0, min(1, (item.current - item.start) / (item.target - item.start))))) / count(@/results) * 100',
				overallText: 'format(@/derived/overall, 1)'
			}
		},
		data: {
			title: 'Make deploys boring',
			results: [
				{ name: 'Deploy lead time (minutes)', start: 120, target: 30, current: 75 },
				{ name: 'Change failure rate (%)', start: 15, target: 5, current: 11 },
				{ name: 'Weekly deploys', start: 10, target: 40, current: 22 }
			]
		}
	}
};
