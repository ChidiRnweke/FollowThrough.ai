import type { ActorContext } from '$lib/models/identity';
import type { ProjectId } from '$lib/models/projects';
import type { SuggestionKind } from '$lib/models/suggestions';
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
	kind: SuggestionKind
): Promise<EffectVerdict> {
	const { groups } = await lab.controllers.suggestions().list(actor, { status: 'proposed' });
	const kinds = groups.flatMap((group) => group.suggestions.map((view) => view.suggestion.kind));
	const hit = kinds.includes(kind);
	return {
		passed: hit,
		explanation: hit
			? `a "${kind}" suggestion is pending review`
			: `no pending "${kind}" suggestion; found ${kinds.length ? kinds.join(', ') : 'none'}`
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
