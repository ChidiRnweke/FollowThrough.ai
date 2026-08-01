import type { ShellContext } from '$lib/models';

/**
 * What an approval card says about a pending call's arguments.
 *
 * The agent addresses the workspace by id, but an id is not a thing a person can approve:
 * a card reading `ParentId: 9e8e1812-…` asks the user to vouch for a string they cannot
 * read. So ids are either resolved to the name they stand for or dropped, and never
 * rendered raw.
 */
export interface ApprovalFields {
	/** The subject of the change — a title or name — stated on its own line. */
	readonly headline?: string;
	/** Where the change lands, resolved from ids, e.g. "in Platform Notes › Infrastructure". */
	readonly location?: string;
	/** Remaining readable arguments, as "Label: value". */
	readonly details: readonly string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Long strings are prose the model wrote; the card renders them as markdown, not as a line. */
const PROSE_LENGTH = 120;

const argumentLabels: Readonly<Record<string, string>> = {
	markdown: 'Content',
	content: 'Content',
	body: 'Content',
	dueDate: 'Due',
	query: 'Search',
	kind: 'Type',
	status: 'Status',
	priority: 'Priority',
	responsibility: 'Responsibility',
	isPinned: 'Pinned',
	position: 'Position',
	name: 'Name',
	title: 'Title',
	description: 'Description'
};

const sentenceCase = (key: string): string => {
	const spaced = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/_/g, ' ')
		.toLowerCase()
		.trim();
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const argumentLabel = (key: string): string => argumentLabels[key] ?? sentenceCase(key);

/** True for anything that names a record rather than describing it. */
export const isIdentifierArgument = (key: string, value: unknown): boolean =>
	/ids?$/i.test(key) || (typeof value === 'string' && UUID.test(value));

const projectName = (shell: ShellContext | undefined, value: unknown): string | undefined =>
	typeof value === 'string'
		? shell?.projects.find((project) => project.id === value)?.name
		: undefined;

export const noteTitle = (shell: ShellContext | undefined, value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const found = shell?.noteTree.find((entry) => entry.id === value);
	if (!found) return undefined;
	return found.title || 'Untitled';
};

/**
 * Ids the card can name are folded into one place line; ids it cannot are dropped, because a
 * placeholder for an unnameable note tells the user no more than silence does.
 */
const locationOf = (
	args: Readonly<Record<string, unknown>>,
	shell: ShellContext | undefined
): string | undefined => {
	const project = projectName(shell, args.projectId);
	const parent = noteTitle(shell, args.parentId);
	if (project && parent) return `in ${project} › ${parent}`;
	if (project) return `in ${project}`;
	if (parent) return `under ${parent}`;
	return undefined;
};

const readable = (value: unknown): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export function approvalFields(
	args: Readonly<Record<string, unknown>>,
	shell: ShellContext | undefined
): ApprovalFields {
	const headlineKey = typeof args.title === 'string' ? 'title' : 'name';
	const headline = typeof args[headlineKey] === 'string' ? args[headlineKey] : undefined;

	const details = Object.entries(args)
		.filter(([key, value]) => {
			if (key === headlineKey && headline !== undefined) return false;
			if (!readable(value)) return false;
			if (isIdentifierArgument(key, value)) return false;
			return !(typeof value === 'string' && value.length > PROSE_LENGTH);
		})
		.slice(0, 4)
		.map(([key, value]) => `${argumentLabel(key)}: ${String(value)}`);

	const location = locationOf(args, shell);

	return {
		...(headline ? { headline } : {}),
		...(location ? { location } : {}),
		details
	};
}
