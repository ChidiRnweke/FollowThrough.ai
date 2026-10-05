import { widgetTemplates } from '$lib/models/widgets';
import { personaWorkspace } from '../workspaces/profile';
import { BACKGROUND, type WidgetScenario } from './scenario';

export const statusBoard: WidgetScenario = {
	id: 'widget-build-status-board',
	name: 'a status board shows and changes each workstream status',
	prompt:
		'In my Background note, add a status board widget titled "Launch status" with three workstreams: Design is on track, Build is at risk, and Launch is blocked. Let me change each status.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /launch status|status/i,
	probe: [
		{ kind: 'says', label: /design/i, text: /on track/i },
		{ kind: 'says', label: /build/i, text: /at risk/i },
		{ kind: 'says', label: /^launch\b(?! status)/i, text: /blocked/i },
		{ kind: 'edit', row: /build/i, value: 'Blocked' },
		{ kind: 'says', label: /build/i, text: /blocked/i }
	],
	reference: {
		...widgetTemplates.status,
		title: 'Launch status',
		data: { ...widgetTemplates.status.data, title: 'Launch status' }
	}
};

/**
 * The built-in decision log is a read-only table: a person cannot add an entry from the widget.
 * The prompt asks to add over time, so the reference is the same log on an editable table.
 */
export const decisionLog: WidgetScenario = {
	id: 'widget-build-decision-log',
	name: 'a decision log records entries a person keeps adding',
	prompt:
		'In my Background note, add a decision log widget with the columns Decision, Owner and Date. The first entry is "Move CI to self-hosted runners", owned by Robin, on 2026-09-14. I will add decisions over time.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /decision/i,
	probe: [
		{ kind: 'mentions', text: /self-hosted runners/i },
		{
			kind: 'addRow',
			cells: [
				{ column: /decision|what/i, value: 'Adopt OpenTofu' },
				{ column: /owner|who/i, value: 'Sam' },
				{ column: /date|when/i, value: '2026-10-01' }
			]
		},
		{ kind: 'mentions', text: /adopt opentofu/i },
		{ kind: 'mentions', text: /self-hosted runners/i }
	],
	reference: {
		title: 'Decision log',
		layout: {
			root: 'card',
			elements: {
				card: { type: 'Card', props: { title: { $state: '/title' } }, children: ['table'] },
				table: {
					type: 'DataTable',
					props: {
						rows: { $bindState: '/decisions' },
						columns: [
							{ key: 'decision', label: 'Decision', kind: 'text' },
							{ key: 'owner', label: 'Owner', kind: 'text' },
							{ key: 'date', label: 'Date', kind: 'text' }
						],
						addLabel: 'Add decision',
						removable: true
					},
					children: []
				}
			}
		},
		data: {
			title: 'Decision log',
			decisions: [
				{ decision: 'Move CI to self-hosted runners', owner: 'Robin', date: '2026-09-14' }
			]
		}
	}
};

/**
 * Weights 3/2/1 score Build 5·3 + 2·2 + 2·1 = 21, Buy 9 + 6 + 4 = 19 and Wait 3 + 10 + 5 = 18.
 * An impact weight of 1 scores them 11, 13 and 16, so waiting leads.
 */
export const decisionMatrix: WidgetScenario = {
	id: 'widget-build-decision-matrix',
	name: 'a decision matrix names the leader and follows the weights',
	prompt:
		'In my Background note, add a decision matrix widget to choose between "Build in house", "Buy a vendor tool" and "Wait a quarter". Score each from 1 to 5 on impact, cost and risk, where higher is better: Build in house 5, 2, 2; Buy a vendor tool 3, 3, 4; Wait a quarter 1, 5, 5. Weight impact 3, cost 2 and risk 1, and let me move the weights. Show the leading option and a chart of the weighted scores.',
	workspace: personaWorkspace,
	...BACKGROUND,
	titleFragment: /decision|matrix/i,
	probe: [
		{ kind: 'says', label: /lead|best|winner|top|recommend/i, text: /build in house/i },
		// The scores show where the prompt asked for them: per option, as the chart plots them.
		{ kind: 'reads', label: /build in house/i, near: 21, tolerance: 0 },
		{ kind: 'chart', points: 3 },
		{ kind: 'set', input: /impact/i, value: 1 },
		{ kind: 'says', label: /lead|best|winner|top|recommend/i, text: /wait a quarter/i },
		{ kind: 'reads', label: /wait a quarter/i, near: 16, tolerance: 0 }
	],
	reference: widgetTemplates.decision
};
