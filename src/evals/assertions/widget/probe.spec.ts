import { describe, expect, it } from 'vitest';
import { widgetTemplates, type WidgetDraft } from '$lib/models/widgets';
import type { LocalDate } from '$lib/models/workspace';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { WidgetSourceRecords } from '$lib/services/widgets/sources';
import { savingsSimulator } from '../../fixtures/widgets/calculators';
import { decisionLog } from '../../fixtures/widgets/records';
import { projectDashboard } from '../../fixtures/widgets/dashboard';
import { scenarioRecords } from '../../fixtures/widgets/scenario';
import { relocationChecklist } from '../../fixtures/widgets/trackers';
import { runWidgetProbe, type ProbeStep } from './probe';

const noRecords: WidgetSourceRecords = {
	projectId: testProjectId(),
	today: '2026-10-05' as LocalDate,
	todos: [],
	notes: []
};

const probe = (draft: WidgetDraft, steps: readonly ProbeStep[], records = noRecords) =>
	runWidgetProbe(widgetBuilder({ ...draft }), records, steps).findings.join('\n');

/** A simulator that prints the right first answer and computes nothing. */
const pictureOfASimulator: WidgetDraft = {
	title: 'Savings simulator',
	layout: {
		root: 'card',
		elements: {
			card: {
				type: 'Card',
				props: { title: 'Savings' },
				children: ['monthly', 'years', 'balance', 'chart']
			},
			monthly: {
				type: 'NumberInput',
				props: { label: 'Monthly deposit', value: { $bindState: '/monthly' } },
				children: []
			},
			years: {
				type: 'Slider',
				props: { label: 'Years', value: { $bindState: '/years' }, min: 1, max: 40 },
				children: []
			},
			balance: { type: 'Metric', props: { label: 'Balance', value: '58,320' }, children: [] },
			chart: {
				type: 'LineChart',
				props: {
					rows: { $state: '/points' },
					x: 'year',
					series: [{ key: 'balance', label: 'Balance' }]
				},
				children: []
			}
		}
	},
	data: {
		monthly: 200,
		years: 15,
		points: Array.from({ length: 16 }, (_, year) => ({ year, balance: 5000 + year * 3500 }))
	}
};

/** The dashboard with its counts typed in: right today, wrong after the next todo. */
const frozenDashboard: WidgetDraft = {
	...widgetTemplates.dashboard,
	layout: {
		...widgetTemplates.dashboard.layout,
		elements: {
			...widgetTemplates.dashboard.layout.elements,
			open: { type: 'Metric', props: { label: 'Open todos', value: 5 }, children: [] }
		}
	}
};

const dashboardRecords = scenarioRecords(
	projectDashboard,
	testProjectId(),
	'2026-10-05' as LocalDate
);

describe('widget probe', () => {
	it('fails a simulator whose numbers do not follow its inputs', () => {
		expect(probe(pictureOfASimulator, savingsSimulator.probe)).toMatch(
			/step 5 \(read .*\): .*should read about 363\d{3}/
		);
	});

	it('names a formula that fails', () => {
		const draft: WidgetDraft = {
			...widgetTemplates.loan,
			layout: {
				...widgetTemplates.loan.layout,
				derived: { ...widgetTemplates.loan.layout.derived, broken: '1 / 0' }
			}
		};
		expect(probe(draft, [])).toMatch(/as saved: \/layout\/derived\/broken/);
	});

	it('fails a log that offers no way to add an entry', () => {
		expect(probe(widgetTemplates.decisions, decisionLog.probe)).toMatch(
			/no editable table has columns|no way to add a row/
		);
	});

	it('fails a dashboard whose counts are typed in', () => {
		expect(probe(frozenDashboard, projectDashboard.probe, dashboardRecords)).toMatch(
			/step 8 \(read .*\): .*should read about 6/
		);
	});

	it('fails a checklist with nothing to type a new item into', () => {
		expect(
			probe(
				{
					...widgetTemplates.checklist,
					layout: {
						...widgetTemplates.checklist.layout,
						elements: {
							...widgetTemplates.checklist.layout.elements,
							card: { type: 'Card', props: { title: 'Relocation' }, children: ['items'] }
						}
					}
				},
				relocationChecklist.probe.slice(2)
			)
		).toMatch(/no input labelled/);
	});

	it('reads a value printed as a fraction when the step says it is a percentage', () => {
		expect(
			probe(
				{
					title: 'Progress',
					layout: {
						root: 'metric',
						elements: {
							metric: { type: 'Metric', props: { label: 'Overall', value: 0.433 }, children: [] }
						}
					},
					data: {}
				},
				[{ kind: 'reads', label: /overall/i, near: 43.33, tolerance: 0.02, percent: true }]
			)
		).toBe('');
	});
});
