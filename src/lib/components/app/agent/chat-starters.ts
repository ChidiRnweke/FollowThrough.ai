/**
 * Opening prompts for an empty thread.
 *
 * These are the panel's only chance to teach that the agent *writes* — it edits
 * notes, creates todos and fills memory, not just answers. So every starter
 * names an action with a destination, none of them is a plain question, and the
 * destination is carried in the data so the row can show it.
 * Three per surface: a fourth is a menu, and a menu gets skimmed.
 *
 * Each one is kept short enough to sit on a single line in the docked panel
 * (~44 characters). A wrapped starter turns a scannable list into a paragraph.
 */
export type StarterSurface = 'note' | 'todos' | 'project' | 'unscoped';

/**
 * What the starter will change. It is what the row's icon shows, so the list
 * reads as three destinations rather than three sentences — the same vocabulary
 * as the capability row above it, which counts those destinations.
 */
export type StarterTarget = 'notes' | 'todos' | 'memory';

export interface Starter {
	readonly prompt: string;
	readonly target: StarterTarget;
}

const starters: Record<StarterSurface, readonly Starter[]> = {
	note: [
		{ prompt: 'Extract every commitment into todos', target: 'todos' },
		{ prompt: 'Rewrite this note as a summary and save it', target: 'notes' },
		{ prompt: 'Save this note’s constraints to memory', target: 'memory' }
	],
	todos: [
		{ prompt: 'Prioritise my todos against my notes', target: 'todos' },
		{ prompt: 'Link todos that have no source note', target: 'todos' },
		{ prompt: 'Draft this week’s plan from what is open', target: 'notes' }
	],
	project: [
		{ prompt: 'Interview me to build project memory', target: 'memory' },
		{ prompt: 'Find duplicate notes and propose a cleanup', target: 'notes' },
		{ prompt: 'Write an overview from the notes here', target: 'notes' }
	],
	unscoped: [
		{ prompt: 'Interview me to build my profile memory', target: 'memory' },
		{ prompt: 'Show what is overdue and who I am waiting on', target: 'todos' },
		{ prompt: 'Turn what I tell you next into a note', target: 'notes' }
	]
};

export const chatStarters = (surface: StarterSurface): readonly Starter[] => starters[surface];

/**
 * A note in focus always wins: it is the most specific thing the agent can act
 * on, and the starters for it are the most concrete.
 */
export function starterSurface(options: {
	readonly hasNote: boolean;
	readonly hasProject: boolean;
	readonly pathname: string;
}): StarterSurface {
	if (options.hasNote) return 'note';
	if (options.pathname.includes('/todos')) return 'todos';
	return options.hasProject ? 'project' : 'unscoped';
}
