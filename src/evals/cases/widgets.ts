import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { widgetTemplates, type Widget, type WidgetDraft } from '$lib/models/widgets';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';
import type { Lab } from '../lab/application';
import { seedWorkspace, type SeededWorkspace, type WorkspaceFixture } from '../lab/workspace';
import { runCase, type AgentRunResult } from '../lab/run-case';
import { findCall, scoreToolCalling } from '../assertions/tool-calls';
import { runWidgetProbe, type ProbeStep } from '../assertions/widget/probe';
import {
	embedVerdict,
	savedWidgets,
	sourceRecordsFor,
	widgetTitled,
	type WidgetVerdict
} from '../assertions/widget/saved';
import { personaWorkspace } from '../fixtures/workspaces/profile';
import { WIDGET_SCENARIOS } from '../fixtures/widgets';
import {
	annuityPayment,
	futureValue,
	TICKED,
	UNTICKED,
	type WidgetScenario
} from '../fixtures/widgets/scenario';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Widgets, judged by using them (ADR 0043).
 *
 * A build case asks for a widget in one prompt, then does what the person would do with it: read
 * the numbers, move an input, add a row, read again. `runWidgetProbe` finds everything by its
 * label, so the agent's data keys and formula names are free. Expected numbers are closed-form
 * values from the fixtures, and `scenarios.spec.ts` proves a hand-built reference passes every
 * probe, so a failure here is the agent's widget, not an impossible probe.
 *
 * Building and embedding are separate annotations. `widget_build` gates; `widget_embed` is
 * reported only, because ADR 0043 has not decided how create-and-embed should work, and one
 * verdict for both would hide whether the widget itself works.
 */

const annotate = (name: string, verdict: WidgetVerdict, labels: readonly [string, string]) =>
	px.logAnnotation({
		name,
		score: verdict.passed ? 1 : 0,
		label: verdict.passed ? labels[0] : labels[1],
		explanation: verdict.explanation
	});

/** Run a probe on what was saved, with the project's todos as the widget's sources. */
async function probeSaved(
	lab: Lab,
	workspace: SeededWorkspace,
	widget: Widget,
	steps: readonly ProbeStep[]
): Promise<WidgetVerdict> {
	const verdict = runWidgetProbe(
		widget,
		await sourceRecordsFor(lab, workspace.actor, widget),
		steps
	);
	return {
		passed: verdict.passed,
		explanation: verdict.passed
			? `widget "${widget.title}" passes all ${steps.length} probe steps`
			: verdict.findings.join('\n')
	};
}

/** What the run did, for a verdict that found nothing to grade. */
const runSummary = (result: AgentRunResult): string =>
	`run ${result.status}${result.failure ? ` (${result.failure})` : ''}; called ${
		result.calledToolNames.join(', ') || 'no tools'
	}; replied "${result.finalResponse.slice(0, 300)}"`;

/** Calls the tool rejected: each one is a payload the agent had to repair. */
const rejected = (result: AgentRunResult, tool: string): number =>
	result.toolCalls.filter((call) => call.name === tool && call.failure).length;

/** Whether the agent read the catalog before its first successful create. */
const catalogFirst = (result: AgentRunResult): WidgetVerdict => {
	const names = result.calledToolNames;
	const read = names.indexOf('read_widget_catalog');
	const create = names.indexOf('create_widget');
	return {
		passed: read !== -1 && read < create,
		explanation:
			read === -1
				? 'never read the widget catalog'
				: read < create
					? 'read the catalog before creating'
					: 'created before reading the catalog'
	};
};

const noteIdOf = (workspace: SeededWorkspace, title: string) => {
	const noteId = workspace.noteIds.get(title);
	if (!noteId) throw new Error(`The fixture must seed a "${title}" note`);
	return noteId;
};

function buildCase(scenario: WidgetScenario): EvalCase {
	return {
		id: scenario.id,
		name: scenario.name,
		splits: [ARCHETYPES.widgetBuild, ARCHETYPES.widgetEmbed],
		input: { prompt: scenario.prompt },
		expected: {
			widget: scenario.titleFragment.source,
			note: scenario.noteTitle,
			probeSteps: scenario.probe.length
		},
		metadata: {
			layer: 'end-state',
			note: 'One prompt; the widget is probed as a person would use it (ADR 0043).'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, scenario.workspace);
			const noteId = noteIdOf(workspace, scenario.noteTitle);
			const result = await runCase(lab, workspace.actor, {
				prompt: scenario.prompt,
				mode: 'auto_accept'
			});
			const found = widgetTitled(await savedWidgets(lab, workspace.actor), scenario.titleFragment);
			const build =
				found.kind === 'found'
					? await probeSaved(lab, workspace, found.widget, scenario.probe)
					: { passed: false, explanation: `${found.explanation}; ${runSummary(result)}` };
			const embedded =
				found.kind === 'found'
					? await embedVerdict(lab, workspace.actor, noteId, found.widget)
					: { passed: false, explanation: 'no widget to embed' };
			const embed = embedded.passed
				? embedded
				: { passed: false, explanation: `${embedded.explanation}; ${runSummary(result)}` };
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				rejectedCreates: rejected(result, 'create_widget'),
				catalogFirst: catalogFirst(result).explanation,
				layout: findCall(result, 'create_widget')?.arguments,
				build: build.explanation,
				embed: embed.explanation
			});
			annotate(ARCHETYPES.widgetBuild, build, ['works', 'broken']);
			annotate(ARCHETYPES.widgetEmbed, embed, ['embedded', 'not_embedded']);
			expect(build.passed, build.explanation).toBe(true);
		}
	};
}

/** A widget already in a note, for edits: no setup turn, so an edit case measures only the edit. */
const withWidget = (draft: WidgetDraft, noteTitle = 'Background'): WorkspaceFixture => ({
	...personaWorkspace,
	projects: (personaWorkspace.projects ?? []).map((project) => ({
		...project,
		notes: (project.notes ?? []).map((note) =>
			note.title === noteTitle ? { ...note, widgets: [draft] } : note
		)
	}))
});

interface EditScenario {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly seeded: WidgetDraft;
	/** The edit tool the request calls for; the other is the wrong kind of change. */
	readonly tool: 'edit_widget_data' | 'edit_widget_layout';
	readonly probe: readonly ProbeStep[];
	/** The person is looking at the widget, so the agent need not search for it. */
	readonly open?: boolean;
}

const openWidget = (widget: Widget): AppContextSnapshotV1 => {
	const now = new Date();
	return {
		version: 1,
		capturedAt: now.toISOString(),
		client: {
			locale: 'en-GB',
			timeZone: 'UTC',
			localDate: now.toISOString().slice(0, 10),
			layout: 'wide'
		},
		surface: { kind: 'widget', presentation: 'full_page' },
		activeResource: {
			kind: 'widget',
			id: widget.id,
			title: widget.title,
			projectId: widget.projectId
		},
		recentInteractions: []
	};
};

/**
 * The edit landed, as the right kind of change, on the widget that was there. A data request
 * that rewrites the layout, or a second widget made beside the first, leaves the person with
 * something they did not ask for even when the numbers come out right.
 */
function editCase(scenario: EditScenario): EvalCase {
	const otherPart = scenario.tool === 'edit_widget_data' ? 'layoutRevision' : 'dataRevision';
	return {
		id: scenario.id,
		name: scenario.name,
		splits: [ARCHETYPES.widgetEdit],
		input: { prompt: scenario.prompt, open: scenario.open ?? false },
		expected: { tool: scenario.tool, probeSteps: scenario.probe.length },
		metadata: { layer: 'end-state', note: 'The widget is seeded and embedded; one edit turn.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, withWidget(scenario.seeded));
			const before = widgetTitled(
				await savedWidgets(lab, workspace.actor),
				new RegExp(`^${scenario.seeded.title}$`)
			);
			if (before.kind === 'failure') throw new Error(before.explanation);
			const result = await runCase(lab, workspace.actor, {
				prompt: scenario.prompt,
				mode: 'auto_accept',
				...(scenario.open ? { appContext: openWidget(before.widget) } : {})
			});
			const widgets = await savedWidgets(lab, workspace.actor);
			const after = widgets.find((widget) => widget.id === before.widget.id);
			const problems = [
				widgets.length === 1
					? undefined
					: `${widgets.length} widgets exist; the edit made new ones`,
				after ? undefined : 'the seeded widget is gone',
				after && after[otherPart] !== before.widget[otherPart]
					? `the request changed the widget's ${otherPart === 'layoutRevision' ? 'layout' : 'data'} as well`
					: undefined,
				result.calledToolNames.includes(scenario.tool)
					? undefined
					: `never called ${scenario.tool}; ${runSummary(result)}`
			].filter((problem) => problem !== undefined);
			const probe = after
				? await probeSaved(lab, workspace, after, scenario.probe)
				: { passed: false, explanation: 'nothing to probe' };
			const verdict: WidgetVerdict = {
				passed: problems.length === 0 && probe.passed,
				explanation:
					[...problems, probe.passed ? undefined : probe.explanation].filter(Boolean).join('; ') ||
					`${scenario.tool} changed only what was asked`
			};
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				arguments: findCall(result, scenario.tool)?.arguments,
				effect: verdict.explanation
			});
			annotate(ARCHETYPES.widgetEdit, verdict, ['applied', 'not_applied']);
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	};
}

const loanWithoutChart: WidgetDraft = {
	...widgetTemplates.loan,
	layout: {
		...widgetTemplates.loan.layout,
		elements: {
			...widgetTemplates.loan.layout.elements,
			card: {
				...widgetTemplates.loan.layout.elements.card,
				children: ['amount', 'terms', 'results']
			}
		}
	}
};

const EDIT_SCENARIOS: readonly EditScenario[] = [
	{
		id: 'widget-edit-tick-paid',
		name: 'ticking an expense as paid changes only that cell',
		prompt: 'I paid the train pass. Tick it off in my expense tracker.',
		seeded: widgetTemplates.expenses,
		tool: 'edit_widget_data',
		probe: [
			{ kind: 'says', label: /train pass/i, text: TICKED },
			{ kind: 'says', label: /rent/i, text: TICKED },
			{ kind: 'reads', label: /spent|total/i, near: 1446.5 }
		]
	},
	{
		id: 'widget-edit-input-not-layout',
		name: 'a new value for an input is a data edit, not a new layout',
		prompt: 'Run my savings simulator over 30 years instead of 20.',
		seeded: widgetTemplates.savings,
		tool: 'edit_widget_data',
		probe: [{ kind: 'reads', label: /balance/i, near: futureValue(10_000, 250, 5, 30) }]
	},
	{
		id: 'widget-edit-add-chart',
		name: 'adding a chart is a layout edit that keeps the data and the formulas working',
		prompt: 'Add a chart of the balance left by year to my loan calculator.',
		seeded: loanWithoutChart,
		tool: 'edit_widget_layout',
		probe: [
			{ kind: 'chart', points: 25 },
			{
				kind: 'reads',
				label: /payment|monthly/i,
				near: annuityPayment(250_000, 4, 25),
				tolerance: 0.002
			}
		]
	},
	{
		id: 'widget-edit-find-by-content',
		name: 'a widget named only by what it shows is found before it is edited',
		prompt: 'Tick Wednesday for "Write 30 minutes" on my habit tracker.',
		seeded: widgetTemplates.habits,
		tool: 'edit_widget_data',
		// The template has 7 of 14 ticked; Wednesday makes 8, and the other habit keeps its days.
		probe: [
			{ kind: 'reads', label: /this week/i, near: 8, tolerance: 0 },
			{ kind: 'reads', label: /no meetings/i, near: 4, tolerance: 0 }
		]
	},
	{
		id: 'widget-edit-open-widget',
		name: 'the open widget is the one a bare request edits',
		prompt: 'Set the rate to 5%.',
		seeded: widgetTemplates.loan,
		tool: 'edit_widget_data',
		open: true,
		probe: [
			{
				kind: 'reads',
				label: /payment|monthly/i,
				near: annuityPayment(250_000, 5, 25),
				tolerance: 0.002
			}
		]
	}
];

/**
 * The first case PR #299 shipped: two turns, create then tick. Kept under its id so its history
 * stays comparable; the verdict now reads the ticks the way a person sees them.
 */
const createdThenTicked: EvalCase = {
	id: 'effect-widget-created-then-ticked',
	name: 'a widget made in a note keeps the tick the agent sets',
	splits: [ARCHETYPES.widgetEdit, ARCHETYPES.widgetEmbed],
	input: {
		setup:
			'In my Background note, add a checklist widget titled "Relocation" with three items: book movers, update address, cancel lease.',
		prompt: 'Tick "update address" on the Relocation checklist.'
	},
	expected: { widget: 'Relocation', ticked: 'update address' },
	metadata: {
		layer: 'end-state',
		note: 'Two turns: create and embed the widget, then change only its data (ADR 0043).'
	},
	async run(lab) {
		const workspace = await seedWorkspace(lab, personaWorkspace);
		const noteId = noteIdOf(workspace, 'Background');
		await runCase(lab, workspace.actor, {
			prompt: this.input.setup as string,
			mode: 'auto_accept'
		});
		const result = await runCase(lab, workspace.actor, {
			prompt: this.input.prompt as string,
			mode: 'auto_accept'
		});
		const found = widgetTitled(await savedWidgets(lab, workspace.actor), /relocation/i);
		const ticked =
			found.kind === 'found'
				? await probeSaved(lab, workspace, found.widget, [
						{ kind: 'says', label: /update address/i, text: TICKED },
						{ kind: 'says', label: /book movers/i, text: UNTICKED },
						{ kind: 'says', label: /cancel lease/i, text: UNTICKED }
					])
				: { passed: false, explanation: found.explanation };
		const embed =
			found.kind === 'found'
				? await embedVerdict(lab, workspace.actor, noteId, found.widget)
				: { passed: false, explanation: 'no widget to embed' };
		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			arguments: findCall(result, 'edit_widget_data')?.arguments,
			effect: ticked.explanation,
			embed: embed.explanation
		});
		annotate(ARCHETYPES.widgetEdit, ticked, ['applied', 'not_applied']);
		annotate(ARCHETYPES.widgetEmbed, embed, ['embedded', 'not_embedded']);
		expect(ticked.passed, `${ticked.explanation}; ${runSummary(result)}`).toBe(true);
	}
};

/**
 * The person asks for the thing, not the word. A widget tool is behind `search_tools`, so a
 * request that never says "widget" must still lead there, and not to a Markdown table that
 * cannot compute.
 */
const searchTrigger: EvalCase = {
	id: 'widget-search-trigger-calculator',
	name: 'an interactive calculator request finds the widget tools without the word "widget"',
	splits: [ARCHETYPES.toolSearchTrigger],
	input: {
		prompt:
			'Put an interactive mortgage calculator in my Background note: 300,000 at 3.5% over 30 years, and let me play with the rate.'
	},
	expected: { requiredSequence: ['search_tools', 'create_widget'] },
	metadata: { layer: 'agent', note: 'create_widget is not first-class.' },
	async run(lab) {
		const workspace = await seedWorkspace(lab, personaWorkspace);
		const result = await runCase(lab, workspace.actor, {
			prompt: this.input.prompt as string,
			mode: 'auto_accept'
		});
		// Discovery is the capability here: the agent searched, then saved a widget. Payloads it
		// had to repair are logged as `rejectedCreates`, not counted against discovery.
		const names = result.calledToolNames;
		const searched = names.includes('search_tools');
		const created = result.toolCalls.some((call) => call.name === 'create_widget' && !call.failure);
		const verdict: WidgetVerdict =
			searched && created && names.indexOf('search_tools') < names.indexOf('create_widget')
				? { passed: true, explanation: 'searched the catalog, then saved a widget' }
				: {
						passed: false,
						explanation: `${searched ? 'searched' : 'never called search_tools'}; ${created ? 'saved a widget' : 'saved no widget'}; ${runSummary(result)}`
					};
		const found = widgetTitled(await savedWidgets(lab, workspace.actor), /./);
		const build =
			found.kind === 'found'
				? await probeSaved(lab, workspace, found.widget, [
						{
							kind: 'reads',
							label: /payment|monthly/i,
							near: annuityPayment(300_000, 3.5, 30),
							tolerance: 0.002
						}
					])
				: { passed: false, explanation: found.explanation };
		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			build: build.explanation
		});
		px.logAnnotation({
			name: ARCHETYPES.toolSearchTrigger,
			score: verdict.passed ? 1 : 0,
			label: verdict.passed ? 'searched' : 'did_not_search',
			explanation: verdict.explanation
		});
		expect(verdict.passed, verdict.explanation).toBe(true);
	}
};

/** Requests a widget would over-serve: text belongs in the note, and arithmetic in the answer. */
const notAWidget = (
	id: string,
	name: string,
	prompt: string,
	required: readonly string[]
): EvalCase => ({
	id,
	name,
	splits: [ARCHETYPES.toolCalling, 'negative'],
	input: { prompt },
	expected: { forbiddenTools: ['create_widget'], requiredTools: [...required] },
	metadata: { note: 'Negative case: a widget is not warranted.' },
	async run(lab) {
		const workspace = await seedWorkspace(lab, personaWorkspace);
		const result = await runCase(lab, workspace.actor, { prompt, mode: 'auto_accept' });
		px.logOutput({
			model: result.model,
			response: result.finalResponse,
			toolCalls: result.calledToolNames
		});
		// Another tool failing and recovering is not what this case measures.
		const verdict = scoreToolCalling(result, {
			required,
			forbidden: ['create_widget'],
			requireNoFailures: false
		});
		px.logAnnotation({
			name: ARCHETYPES.toolCalling,
			score: verdict.passed ? 1 : 0,
			label: verdict.passed ? 'pass' : 'fail',
			explanation: verdict.explanation
		});
		expect(verdict.passed, verdict.explanation).toBe(true);
	}
});

export const widgetCases: readonly EvalCase[] = [
	...WIDGET_SCENARIOS.map(buildCase),
	createdThenTicked,
	...EDIT_SCENARIOS.map(editCase),
	searchTrigger,
	notAWidget(
		'widget-negative-plain-list',
		'a list asked for as plain text is written into the note, not built as a widget',
		'Add my packing list to my Background note as plain text: passport, charger, rain jacket.',
		['edit_note']
	),
	notAWidget(
		'widget-negative-arithmetic',
		'a one-off sum is answered, not built into a calculator',
		'What is 5% of 10,000?',
		[]
	)
];
