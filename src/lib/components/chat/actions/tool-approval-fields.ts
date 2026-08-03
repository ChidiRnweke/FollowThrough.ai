import type { ShellContext } from '$lib/models/workspace';

/**
 * What an approval card says about a pending call's arguments.
 *
 * The agent addresses the workspace by id, but an id is not a thing a person can approve:
 * a card reading `ParentId: 9e8e1812-…` asks the user to vouch for a string they cannot
 * read. So ids are either resolved to the name they stand for or dropped, and never
 * rendered raw. Arguments that arrive as arrays of objects (the todos of a `create_todos`
 * call, say) become one item per element, so the content under review is always visible.
 */
export interface ApprovalItem {
	/** The item's own subject — a title or name — stated on its own line. */
	readonly headline?: string;
	/** The item's readable fields, as "Label: value". */
	readonly details: readonly string[];
}

export interface ApprovalFields {
	/** The subject of the change — a title or name — stated on its own line. */
	readonly headline?: string;
	/** Where the change lands, resolved from ids, e.g. "in Platform Notes › Infrastructure". */
	readonly location?: string;
	/** Remaining readable arguments, as "Label: value". */
	readonly details: readonly string[];
	/**
	 * Content held in arrays of objects, one entry per element — the todos of a
	 * `create_todos` call, say. Without this the card asks for approval of content
	 * it never shows.
	 */
	readonly items?: readonly ApprovalItem[];
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
const placeOf = (project: string | undefined, parent: string | undefined): string | undefined => {
	if (project && parent) return `in ${project} › ${parent}`;
	if (project) return `in ${project}`;
	if (parent) return `under ${parent}`;
	return undefined;
};

const readable = (value: unknown): value is string | number | boolean =>
	typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The subject and detail lines of one argument record, whether it is the call's
 * top-level arguments or one element of a structured argument. `excludeProse`
 * applies only at the top level, where long strings render as markdown instead;
 * an item has no such outlet, so its fields read as lines however long they are.
 */
const subjectOf = (
	record: Readonly<Record<string, unknown>>,
	options: { readonly cap?: number; readonly excludeProse?: boolean } = {}
): ApprovalItem => {
	const headlineKey = typeof record.title === 'string' ? 'title' : 'name';
	const headline = typeof record[headlineKey] === 'string' ? record[headlineKey] : undefined;

	const entries = Object.entries(record).filter(([key, value]) => {
		if (key === headlineKey && headline !== undefined) return false;
		if (!readable(value)) return false;
		if (isIdentifierArgument(key, value)) return false;
		return !(options.excludeProse && typeof value === 'string' && value.length > PROSE_LENGTH);
	});
	const capped = options.cap === undefined ? entries : entries.slice(0, options.cap);

	return {
		...(headline ? { headline } : {}),
		details: capped.map(([key, value]) => `${argumentLabel(key)}: ${String(value)}`)
	};
};

export function approvalFields(
	args: Readonly<Record<string, unknown>>,
	shell: ShellContext | undefined
): ApprovalFields {
	const top = subjectOf(args, { cap: 4, excludeProse: true });

	const items = Object.values(args)
		.filter((value): value is readonly unknown[] => Array.isArray(value))
		.flatMap((value) => value.filter(isPlainObject).map((element) => subjectOf(element)));

	// A call that addresses a note by id alone (archive_note, say) would otherwise
	// render with no subject at all; one that also carries a title (rename_note)
	// still needs the note named, as context rather than as the headline.
	const note = noteTitle(shell, args.noteId);
	const headline = top.headline ?? note;
	const onNote = note && top.headline ? `on ${note}` : undefined;
	const place = placeOf(projectName(shell, args.projectId), noteTitle(shell, args.parentId));
	const location = [onNote, place].filter(Boolean).join(' ') || undefined;

	return {
		...(headline ? { headline } : {}),
		...(location ? { location } : {}),
		details: top.details,
		...(items.length > 0 ? { items } : {})
	};
}
