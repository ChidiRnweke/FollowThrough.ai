import type { WidgetDraft } from '$lib/models/widgets';
import type { ProjectId } from '$lib/models/projects';
import type { TodoId } from '$lib/models/todos';
import type { LocalDate } from '$lib/models/workspace';
import type { WidgetSourceRecords } from '$lib/services/widgets/sources';
import type { WorkspaceFixture } from '../../lab/workspace';
import type { ProbeStep } from '../../assertions/widget/probe';

/**
 * A widget a person asks the agent for, and how to tell whether they got it.
 *
 * `probe` is what the person then does with the widget: read a number, move an input, add a row,
 * read again. Expected numbers are worked out in closed form beside each scenario, never with the
 * formula engine the widget runs on, so a fault in that engine cannot agree with itself.
 */
export interface WidgetScenario {
	/** Stable; the eval case id is derived from it. */
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly workspace: WorkspaceFixture;
	readonly projectName: string;
	/** The note the widget is asked for in, which must embed it afterwards. */
	readonly noteTitle: string;
	/** Loose match on the saved title; the agent may phrase it its own way. */
	readonly titleFragment: RegExp;
	readonly probe: readonly ProbeStep[];
	/**
	 * A widget that answers the prompt, built by hand from the catalog. The calibration spec runs
	 * the probe on it, so a probe no correct widget could pass never reaches a live run.
	 */
	readonly reference: WidgetDraft;
}

/** How a ticked and an unticked box read: a checkbox says so, a table cell prints a mark. */
export const TICKED = /^(checked|☑)$/;
export const UNTICKED = /^(unchecked|☐)$/;

/** The persona workspace's one note, where single-note scenarios ask for their widget. */
export const BACKGROUND = { projectName: 'Profile', noteTitle: 'Background' } as const;

/** Balance after monthly compounding with deposits at the end of each month. */
export const futureValue = (start: number, monthly: number, yearlyRate: number, years: number) => {
	const rate = yearlyRate / 1200;
	const growth = (1 + rate) ** (12 * years);
	return start * growth + (monthly * (growth - 1)) / rate;
};

/** Equal monthly payment that repays `principal` over `years` at a fixed yearly rate. */
export const annuityPayment = (principal: number, yearlyRate: number, years: number) => {
	const rate = yearlyRate / 1200;
	return (principal * rate) / (1 - (1 + rate) ** -(12 * years));
};

/** The scenario's seeded todos as a widget's sources read them, for a run without a database. */
export const scenarioRecords = (
	scenario: Pick<WidgetScenario, 'workspace'>,
	projectId: ProjectId,
	today: LocalDate
): WidgetSourceRecords => ({
	projectId,
	today,
	todos: (scenario.workspace.todos ?? []).map((todo, index) => ({
		id: `seeded-${index}` as TodoId,
		projectId,
		title: todo.title,
		status: todo.status ?? 'open',
		responsibility: todo.responsibility?.kind ?? 'mine',
		...(todo.dueDate ? { dueDate: todo.dueDate as LocalDate } : {})
	})),
	notes: []
});
