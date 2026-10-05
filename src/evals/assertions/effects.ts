import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { SuggestionKind } from '$lib/models/suggestions';
import type { NoteId } from '$lib/models/notes';
import type { JsonValue, Widget } from '$lib/models/widgets';
import { resolveWidgetState } from '$lib/services/widgets/formulas';
import { widgetReferencesIn } from '$lib/services/notes/references';
import type { Lab } from '../lab/application';

/**
 * Verifies the world actually changed.
 *
 * Asserting that a tool was *called* proves the agent chose correctly; it does
 * not prove anything happened. A call can be dispatched with a payload the
 * controller rejects, be silently swallowed by `errorFunction` into a
 * `{failure}` string the model then apologises for, or land against the wrong
 * project. All of those look like a successful tool call in the event log.
 *
 * These read committed state back through the same controllers the UI uses, so
 * a pass means a user would see the result.
 */

export interface EffectVerdict {
	readonly passed: boolean;
	readonly explanation: string;
}

const norm = (value: string): string => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Loose containment, because the agent legitimately rephrases titles. */
const matches = (candidate: string, expected: string): boolean =>
	norm(candidate).includes(norm(expected)) || norm(expected).includes(norm(candidate));

export async function expectTodoCreated(
	lab: Lab,
	actor: ActorContext,
	titleFragment: string,
	projectId?: ProjectId
): Promise<EffectVerdict> {
	const { todos } = await lab.controllers.todos().list(actor, {});
	const matchingTitles = todos.filter((view) => matches(view.todo.title, titleFragment));
	const hit = matchingTitles.find(
		(view) => projectId === undefined || view.todo.projectId === projectId
	);
	return {
		passed: Boolean(hit),
		explanation: hit
			? `todo persisted as "${hit.todo.title}"${projectId ? ' in the expected project' : ''}`
			: matchingTitles.length
				? `todo matching "${titleFragment}" persisted only in the wrong project`
				: `no todo matching "${titleFragment}"; found ${todos.length ? todos.map((view) => `"${view.todo.title}"`).join(', ') : 'none'}`
	};
}

export async function expectProjectCreated(
	lab: Lab,
	actor: ActorContext,
	nameFragment: string
): Promise<EffectVerdict> {
	const { projects } = await lab.controllers.projects().list(actor);
	const names = projects.map((project) => project.name);
	const hit = names.find((name) => matches(name, nameFragment));
	return {
		passed: Boolean(hit),
		explanation: hit
			? `project persisted as "${hit}"`
			: `no project matching "${nameFragment}"; found ${names.map((n) => `"${n}"`).join(', ')}`
	};
}

export async function expectNoteCreated(
	lab: Lab,
	actor: ActorContext,
	titleFragment: string,
	projectId?: ProjectId
): Promise<EffectVerdict> {
	const shell = await lab.controllers.workspace().getShellContext(actor);
	const matchingTitles = shell.noteTree.filter((note) => matches(note.title, titleFragment));
	const hit = matchingTitles.find(
		(note) => projectId === undefined || note.projectId === projectId
	);
	return {
		passed: Boolean(hit),
		explanation: hit
			? `note persisted as "${hit.title}"${projectId ? ' in the expected project' : ''}`
			: matchingTitles.length
				? `note matching "${titleFragment}" persisted only in the wrong project`
				: `no note matching "${titleFragment}"; found ${shell.noteTree.map((note) => `"${note.title}"`).join(', ')}`
	};
}

/**
 * A proposal must land as a reviewable suggestion. `propose_memory_change`
 * returning successfully is not the same as the user having something to
 * approve — the whole point of a proposal tool is the review queue.
 */
export async function expectSuggestionPending(
	lab: Lab,
	actor: ActorContext,
	kind: SuggestionKind,
	matchesMemoryContent?: (content: string) => boolean
): Promise<EffectVerdict> {
	const { groups } = await lab.controllers.suggestions().list(actor, { status: 'proposed' });
	const suggestions = groups.flatMap((group) => group.suggestions.map((view) => view.suggestion));
	const matchingKind = suggestions.filter((suggestion) => suggestion.kind === kind);
	const hit = matchesMemoryContent
		? matchingKind.some(
				(suggestion) =>
					suggestion.kind === 'memory' &&
					typeof suggestion.payload.content === 'string' &&
					matchesMemoryContent(suggestion.payload.content)
			)
		: matchingKind.length > 0;
	return {
		passed: hit,
		explanation: hit
			? `a matching "${kind}" suggestion is pending review`
			: `no matching pending "${kind}" suggestion; found ${matchingKind.length ? matchingKind.map((suggestion) => (suggestion.kind === 'memory' ? suggestion.payload.content : suggestion.kind)).join('; ') : 'none'}`
	};
}

export async function expectTodoProposed(
	lab: Lab,
	actor: ActorContext,
	titleFragment: string
): Promise<EffectVerdict> {
	const { groups } = await lab.controllers.suggestions().list(actor, { status: 'proposed' });
	const titles = groups.flatMap((group) =>
		group.suggestions.flatMap((view) =>
			view.suggestion.kind === 'todo' ? [view.suggestion.payload.title] : []
		)
	);
	const hit = titles.find((title) => matches(title, titleFragment));
	return {
		passed: Boolean(hit),
		explanation: hit
			? `todo proposed as "${hit}"`
			: `no todo proposal matching "${titleFragment}"; found ${titles.length ? titles.map((title) => `"${title}"`).join(', ') : 'none'}`
	};
}

export async function expectMemoryProposed(
	lab: Lab,
	actor: ActorContext,
	contentFragment: string
): Promise<EffectVerdict> {
	const { groups } = await lab.controllers.suggestions().list(actor, { status: 'proposed' });
	const payloads = groups.flatMap((group) =>
		group.suggestions.flatMap((view) =>
			view.suggestion.kind === 'memory' ? [JSON.stringify(view.suggestion.payload)] : []
		)
	);
	const hit = payloads.find((payload) => matches(payload, contentFragment));
	return {
		passed: Boolean(hit),
		explanation: hit
			? `memory proposal contains "${contentFragment}"`
			: `no memory proposal contains "${contentFragment}"`
	};
}

export async function expectMemoryAbsent(
	lab: Lab,
	actor: ActorContext,
	contentFragment: string
): Promise<EffectVerdict> {
	const { entries } = await lab.controllers.memory().list(actor, {});
	const hit = entries.find((entry) => matches(entry.content, contentFragment));
	return {
		passed: !hit,
		explanation: hit
			? `memory was written directly without review: "${hit.content}"`
			: 'no memory entry was committed, as expected for a proposal'
	};
}

export async function expectTodoStatus(
	lab: Lab,
	actor: ActorContext,
	titleFragment: string,
	status: string
): Promise<EffectVerdict> {
	const { todos } = await lab.controllers.todos().list(actor, {});
	const hit = todos.find((view) => matches(view.todo.title, titleFragment));
	if (!hit)
		return { passed: false, explanation: `no todo matching "${titleFragment}" to check status on` };
	return {
		passed: hit.todo.status === status,
		explanation: `"${hit.todo.title}" is ${hit.todo.status}, expected ${status}`
	};
}

/** Nothing was mutated — the assertion for cases where the agent should hold off. */
export async function expectNoProjectCreated(
	lab: Lab,
	actor: ActorContext,
	forbiddenName: string
): Promise<EffectVerdict> {
	const verdict = await expectProjectCreated(lab, actor, forbiddenName);
	return {
		passed: !verdict.passed,
		explanation: verdict.passed
			? `a project matching "${forbiddenName}" was created when none should have been`
			: `no project matching "${forbiddenName}" exists, as expected`
	};
}

export const projectIdFor = (
	workspace: { projectIds: ReadonlyMap<string, ProjectId> },
	name: string
): ProjectId => {
	const id = workspace.projectIds.get(name);
	if (!id) throw new Error(`The "${name}" project was not seeded`);
	return id;
};

/**
 * A checklist-like widget exists, the named note embeds it, and the item matching `ticked` is the
 * only one ticked. Read back through the controllers, so a pass means the user would see it.
 */
/** The saved widget whose title matches, in any of the actor's projects; otherwise why not. */
async function widgetTitled(
	lab: Lab,
	actor: ActorContext,
	titleFragment: string
): Promise<
	| { readonly kind: 'found'; readonly widget: Widget }
	| { readonly kind: 'failure'; readonly explanation: string }
> {
	const { projects } = await lab.controllers.projects().list(actor);
	const widgets = (
		await Promise.all(
			projects.map((project) => lab.controllers.widgets().list(actor, { projectId: project.id }))
		)
	).flatMap((result) => result.widgets);
	const widget = widgets.find((candidate) => matches(candidate.title, titleFragment));
	return widget
		? { kind: 'found', widget }
		: {
				kind: 'failure',
				explanation: `no widget matching "${titleFragment}"; found ${widgets.map((w) => `"${w.title}"`).join(', ') || 'none'}`
			};
}

/** Whether the note embeds the widget, or why it does not. */
async function embedFailure(
	lab: Lab,
	actor: ActorContext,
	noteId: NoteId,
	widget: Widget
): Promise<string | undefined> {
	const { note } = await lab.controllers.notes().get(actor, { noteId });
	return widgetReferencesIn([note]).includes(widget.id)
		? undefined
		: `note "${note.title}" does not embed widget "${widget.title}"`;
}

export async function expectWidgetTicked(
	lab: Lab,
	actor: ActorContext,
	input: {
		readonly titleFragment: string;
		readonly noteId: NoteId;
		readonly ticked: string;
	}
): Promise<EffectVerdict> {
	const found = await widgetTitled(lab, actor, input.titleFragment);
	if (found.kind === 'failure') return { passed: false, explanation: found.explanation };
	const { widget } = found;
	const unembedded = await embedFailure(lab, actor, input.noteId, widget);
	if (unembedded) return { passed: false, explanation: unembedded };
	// The item list is whichever array in the data holds objects with a boolean flag.
	const items = Object.values(widget.data).flatMap((value) =>
		Array.isArray(value) ? value.filter((item) => typeof item === 'object' && item !== null) : []
	);
	const ticks = items.map((item) => {
		const text = JSON.stringify(item);
		const flag = Object.values(item as Record<string, JsonValue>).find(
			(field) => typeof field === 'boolean'
		);
		return { matches: matches(text, input.ticked), done: flag === true };
	});
	const target = ticks.filter((tick) => tick.matches);
	const passed =
		target.length === 1 && target[0]!.done && ticks.filter((tick) => tick.done).length === 1;
	return {
		passed,
		explanation: passed
			? `widget "${widget.title}" is embedded and only "${input.ticked}" is ticked`
			: `widget "${widget.title}" data does not show exactly "${input.ticked}" ticked: ${JSON.stringify(widget.data)}`
	};
}

const CHARTS = new Set(['LineChart', 'AreaChart', 'BarChart']);

/** Every number in a JSON value, at any depth. */
const numbersIn = (value: JsonValue): readonly number[] =>
	typeof value === 'number'
		? [value]
		: Array.isArray(value)
			? value.flatMap(numbersIn)
			: typeof value === 'object' && value !== null
				? Object.values(value).flatMap(numbersIn)
				: [];

/**
 * A simulator the agent built: embedded, plotting a chart, computing its values with formulas
 * that all work out, and arriving within `tolerance` of the expected final value. Monthly and
 * yearly compounding differ by about 2% over fifteen years, so either convention passes.
 */
export async function expectSimulatorWidget(
	lab: Lab,
	actor: ActorContext,
	input: {
		readonly titleFragment: string;
		readonly noteId: NoteId;
		readonly expected: number;
		readonly tolerance: number;
	}
): Promise<EffectVerdict> {
	const found = await widgetTitled(lab, actor, input.titleFragment);
	if (found.kind === 'failure') return { passed: false, explanation: found.explanation };
	const build = simulatorFailure(found.widget, input.expected, input.tolerance);
	const unembedded = await embedFailure(lab, actor, input.noteId, found.widget);
	// The build is judged before the embed, so a failure says whether the widget itself works.
	const failures = [build ?? 'the widget computes and charts the expected balance', unembedded];
	return build || unembedded
		? { passed: false, explanation: failures.filter(Boolean).join('; ') }
		: { passed: true, explanation: `${failures[0]}, embedded in the note` };
}

/** What is wrong with a simulator widget's build, or undefined when it works. */
const simulatorFailure = (
	widget: Widget,
	expected: number,
	tolerance: number
): string | undefined => {
	const charts = Object.values(widget.layout.elements).filter((element) =>
		CHARTS.has(element.type)
	);
	if (charts.length === 0) return `widget "${widget.title}" has no chart`;
	if (Object.keys(widget.layout.derived ?? {}).length === 0)
		return `widget "${widget.title}" computes nothing with formulas`;
	const { state, issues } = resolveWidgetState(widget.layout, widget.data, {});
	if (issues.length > 0) return `formulas fail: ${JSON.stringify(issues)}`;
	const close = numbersIn(state.derived ?? null).some(
		(value) => Math.abs(value - expected) <= expected * tolerance
	);
	return close
		? undefined
		: `no computed value is within ${tolerance * 100}% of ${expected}: ${JSON.stringify(state.derived).slice(0, 400)}`;
};
