import { describe, expect, it } from 'vitest';
import { widgetTemplates, type WidgetDraft } from '$lib/models/widgets';
import type { LocalDate } from '$lib/models/workspace';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { WidgetSourceRecords } from '$lib/services/widgets/sources';
import { decisionLog, decisionMatrix, statusBoard } from '../../fixtures/widgets/records';
import {
	gradeCalculator,
	savingsSimulator,
	tripSplitter
} from '../../fixtures/widgets/calculators';
import { okrTracker, relocationChecklist } from '../../fixtures/widgets/trackers';
import { projectDashboard } from '../../fixtures/widgets/dashboard';
import { scenarioRecords } from '../../fixtures/widgets/scenario';
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

	// The shapes below are widgets a live run built correctly and an earlier grader misread.

	it('reads a status beside its row name when the dropdown has no label of its own', () => {
		const draft: WidgetDraft = {
			...widgetTemplates.status,
			layout: {
				...widgetTemplates.status.layout,
				elements: {
					...widgetTemplates.status.layout.elements,
					status: {
						...widgetTemplates.status.layout.elements.status,
						props: { ...widgetTemplates.status.layout.elements.status.props, label: '' }
					}
				}
			}
		};
		expect(probe(draft, statusBoard.probe)).toBe('');
	});

	it('adds a row to a table whose names sit under "Cost" and amounts under "Amount (€)"', () => {
		const draft: WidgetDraft = {
			...tripSplitter.reference,
			layout: {
				...tripSplitter.reference.layout,
				elements: {
					...tripSplitter.reference.layout.elements,
					costs: {
						type: 'DataTable',
						props: {
							rows: { $bindState: '/costs' },
							columns: [
								{ key: 'item', label: 'Cost', kind: 'text' },
								{ key: 'amount', label: 'Amount (€)', kind: 'number' }
							],
							addLabel: 'Add cost'
						},
						children: []
					}
				}
			}
		};
		expect(probe(draft, tripSplitter.probe)).toBe('');
	});

	it('finds a key result field by the card it sits in and reads an unlabelled bar by its heading', () => {
		const card = (key: string, title: string) => ({
			type: 'Card',
			props: { title },
			children: [`${key}Current`]
		});
		const current = (key: string) => ({
			type: 'NumberInput',
			props: { label: 'Current', value: { $bindState: `/${key}/current` } },
			children: []
		});
		const draft: WidgetDraft = {
			title: 'Make deploys boring',
			layout: {
				root: 'root',
				elements: {
					root: {
						type: 'Stack',
						props: {},
						children: ['heading', 'bar', 'lead', 'failure', 'deploys']
					},
					heading: { type: 'Heading', props: { text: 'Overall progress' }, children: [] },
					bar: {
						type: 'Progress',
						props: { value: { $state: '/derived/overall' }, max: 100 },
						children: []
					},
					lead: card('lead', 'Deploy lead time'),
					leadCurrent: current('lead'),
					failure: card('failure', 'Change failure rate'),
					failureCurrent: current('failure'),
					deploys: card('deploys', 'Weekly deploys'),
					deploysCurrent: current('deploys')
				},
				derived: {
					overall:
						'round(((120 - @/lead/current) / 90 + (15 - @/failure/current) / 10 + (@/deploys/current - 10) / 30) / 3 * 1000) / 10'
				}
			},
			data: { lead: { current: 75 }, failure: { current: 11 }, deploys: { current: 22 } }
		};
		expect(probe(draft, okrTracker.probe)).toBe('');
	});

	it('reads the leader from the text under a "Leading option" heading', () => {
		const elements = widgetTemplates.decision.layout.elements;
		const draft: WidgetDraft = {
			...widgetTemplates.decision,
			layout: {
				...widgetTemplates.decision.layout,
				elements: {
					...elements,
					card: {
						...elements.card,
						children: ['leaderHeading', 'leader', 'weights', 'table', 'chart']
					},
					leaderHeading: { type: 'Heading', props: { text: 'Leading option' }, children: [] },
					leader: { type: 'Text', props: { text: { $state: '/derived/leader' } }, children: [] }
				}
			}
		};
		expect(probe(draft, decisionMatrix.probe)).toBe('');
	});

	it('changes a score kept in a field named only for its part, such as "Midterm (30%)"', () => {
		const input = (label: string, key: string) => ({
			type: 'NumberInput',
			props: { label, value: { $bindState: `/${key}` } },
			children: []
		});
		const metric = (label: string, formula: string) => ({
			type: 'Metric',
			props: { label, value: { $state: `/derived/${formula}` } },
			children: []
		});
		const draft: WidgetDraft = {
			title: 'Grades',
			layout: {
				root: 'card',
				elements: {
					card: {
						type: 'Card',
						props: { title: 'Grade calculator' },
						children: ['assignments', 'midterm', 'average', 'needed']
					},
					assignments: input('Assignments (20%)', 'assignments'),
					midterm: input('Midterm (30%)', 'midterm'),
					average: metric('Current average', 'average'),
					needed: metric('Score needed on final', 'needed')
				},
				derived: {
					average: '(0.2 * @/assignments + 0.3 * @/midterm) / 0.5',
					needed: '(70 - 0.2 * @/assignments - 0.3 * @/midterm) / 0.5'
				}
			},
			data: { assignments: 78, midterm: 65 }
		};
		expect(probe(draft, gradeCalculator.probe)).toBe('');
	});

	it('finds a "Now" field by the heading above it', () => {
		const result = (key: string) => ({
			type: 'Stack',
			props: {},
			children: [`${key}Name`, `${key}Now`]
		});
		const heading = (text: string) => ({ type: 'Heading', props: { text }, children: [] });
		const now = (key: string) => ({
			type: 'NumberInput',
			props: { label: 'Now', value: { $bindState: `/${key}` } },
			children: []
		});
		const draft: WidgetDraft = {
			title: 'Make deploys boring',
			layout: {
				root: 'root',
				elements: {
					root: { type: 'Stack', props: {}, children: ['lead', 'failure', 'deploys', 'overall'] },
					lead: result('lead'),
					leadName: heading('Deploy lead time'),
					leadNow: now('lead'),
					failure: result('failure'),
					failureName: heading('Change failure rate'),
					failureNow: now('failure'),
					deploys: result('deploys'),
					deploysName: heading('Weekly deploys'),
					deploysNow: now('deploys'),
					overall: {
						type: 'Metric',
						props: { label: 'Overall progress', value: { $state: '/derived/overall' } },
						children: []
					}
				},
				derived: {
					overall:
						'round(((120 - @/lead) / 90 + (15 - @/failure) / 10 + (@/deploys - 10) / 30) / 3 * 1000) / 10'
				}
			},
			data: { lead: 75, failure: 11, deploys: 22 }
		};
		expect(probe(draft, okrTracker.probe)).toBe('');
	});
});
