import type { EntityRef } from '$lib/models/tool-display';
import type { ShellContext } from '$lib/models/workspace';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import { isAgentPayloadObject, type AgentPayload } from '$lib/models/agent/payload';
import { toolFailure, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { mechanismTools, type MechanismTool } from './rendered-tools';
import { completedToolLabel, friendlyToolLabel } from './tool-labels';
import { explainToolFailure } from './tool-result';
import { fileEntity, toolEntity } from './tool-entities';
import { toolDisclosure, type FieldChange, type FileOutputLine } from './tool-disclosure';
import { toolPresentationKind } from './tool-catalog-presentation';

/**
 * What a turn did, keyed by the subjects it did it to.
 *
 * The unit here is deliberately not the call. Six calls over one note state one fact — the
 * agent worked on that note — and a list keyed by call can only ever say it six times, which
 * is why every attempt to deduplicate this surface has been a filter fighting its own data.
 * Fold first, and a name cannot repeat: there is one note, so there is one row.
 *
 * The fold also answers the question a reader actually has. "What did it call" is mechanism;
 * "what does it know, and where did it get it" is the thing that makes an answer trustworthy,
 * and it is the same list read the other way round.
 */

/**
 * What the agent saw or wrote in one pass over one subject.
 *
 * A union rather than a bag of optionals: a pass that read passages has no field list, and a
 * pass that set fields has no line numbers. Written as `lines?` and `changed?` beside a kind,
 * both halves would be sayable together and neither would be guaranteed.
 */
export type PassEvidence =
	/** The pass is fully described by its own label — a read whose payload is the subject itself. */
	| { readonly kind: 'none' }
	/** What it saw: matched lines, an excerpt, a listing. */
	| { readonly kind: 'passages'; readonly lines: readonly FileOutputLine[] }
	/** What it set. */
	| { readonly kind: 'fields'; readonly changed: readonly FieldChange[] }
	/** Prose the agent wrote or proposed. */
	| { readonly kind: 'prose'; readonly text: string }
	/**
	 * Why the pass did not land, in the reader's terms, and the run's own words under it.
	 *
	 * Both, because they answer different questions and only one of them is in English. The
	 * cause is resolved here rather than in a view: the fold already asks `explainToolFailure`
	 * what a raw message means, and a component that asked again would be a second answer to
	 * the same question, free to drift.
	 *
	 * `raw` is absent exactly when it would repeat the cause. `explainToolFailure` returns the
	 * message unchanged for anything it does not recognise, so carrying both unconditionally
	 * printed one sentence twice, ten pixels apart — which is the duplication this surface just
	 * removed one level up. Absent means "the cause is already the run's own words".
	 */
	| { readonly kind: 'failure'; readonly cause: string; readonly raw?: string };

export interface SubjectPass {
	/** What the agent asked for, in the reader's words: `Searched for`, `Read lines 188–221`. */
	readonly label: string;
	/** The reader's own words handed to a tool. Rendered italic; absent when there were none. */
	readonly query?: string;
	/**
	 * Whether this pass left the subject changed.
	 *
	 * Carried rather than re-derived: the fold already ranks the verbs, so it knows, and a view
	 * that guessed from the label would be reading English to recover a fact the data had. It is
	 * what lets the one line that wrote stand out from the column of looks around it.
	 */
	readonly mutating: boolean;
	readonly evidence: PassEvidence;
}

export type PassOutcome = 'running' | 'done' | 'failed' | 'rejected';

export interface SubjectActivity {
	readonly entity: EntityRef;
	/** The strongest verb that befell it across the turn. */
	readonly verb: Verb;
	readonly outcome: PassOutcome;
	/** Every pass the agent made over it, in the order it made them. */
	readonly passes: readonly SubjectPass[];
}

export interface TurnContext {
	/** Things the turn changed. These lead, because they are what the reader now owns. */
	readonly changed: readonly SubjectActivity[];
	/** Things it only read. This is the context it answered from. */
	readonly read: readonly SubjectActivity[];
	/** Looks that came back with nothing. An absence explains a thin answer. */
	readonly barren: readonly SubjectPass[];
	/** The agent finding its footing: named, reachable, never prominent. */
	readonly setup: readonly string[];
}

/**
 * Which verb survives when one subject was worked on several times. A note searched, excerpted
 * and then edited was edited; saying "searched" of it would be true of a call and false of the
 * turn.
 *
 * Every verb this module emits is in this list. One that is not would rank below every other
 * one through `indexOf`'s `-1`, so a write could silently lose to a read.
 */
const verbRank = [
	'searched',
	'listed',
	'read an excerpt',
	'read history',
	'read',
	'restored a version',
	'restored',
	'renamed',
	'moved',
	'pinned',
	'draft discarded',
	'updated',
	'published',
	'kept',
	'revised',
	'edited',
	'proposed',
	'dismissed',
	'accepted',
	'exported',
	'downloaded',
	'archived',
	'moved to trash',
	'deleted',
	'created'
] as const;

export type Verb = (typeof verbRank)[number];

/** The verbs that leave a subject exactly as it was. Everything else changed something. */
const readVerbs: ReadonlySet<Verb> = new Set<Verb>([
	'searched',
	'listed',
	'read an excerpt',
	'read history',
	'read'
]);

/**
 * Whether a verb changed the subject it befell.
 *
 * Exported so a row can mark a write without keeping its own copy of `readVerbs`. A second copy
 * would be a second answer the day a verb is added, and the one in the component is the copy
 * nobody would think to update.
 */
export const isWriteVerb = (verb: Verb): boolean => !readVerbs.has(verb);

const strongerVerb = (left: Verb, right: Verb): Verb =>
	verbRank.indexOf(right) > verbRank.indexOf(left) ? right : left;

/**
 * What each call leaves behind on the subject it touched.
 *
 * Total over every tool that is not mechanism, so a tool added tomorrow does not compile until
 * someone says what it does to your work. Mechanism tools are absent by construction: they
 * touch nothing of the reader's, and they are collected as setup instead.
 */
const verbs: Record<Exclude<AgentToolName, MechanismTool>, Verb> = {
	get_project: 'read',
	create_project: 'created',
	rename_project: 'renamed',
	archive_project: 'archived',
	create_folder: 'created',
	move_project_entry: 'moved',
	get_note: 'read',
	create_note: 'created',
	save_note: 'edited',
	edit_note: 'edited',
	rename_note: 'renamed',
	archive_note: 'moved to trash',
	restore_note: 'restored',
	delete_note_forever: 'deleted',
	empty_note_trash: 'deleted',
	list_note_versions: 'read history',
	restore_note_version: 'restored a version',
	publish_note: 'published',
	discard_note_draft: 'draft discarded',
	create_todo: 'created',
	create_todos: 'created',
	update_todo: 'updated',
	extract_promises: 'proposed',
	relate_selection: 'proposed',
	revise_mermaid_diagram: 'revised',
	promote_diagram: 'kept',
	accept_suggestion: 'accepted',
	reject_suggestion: 'dismissed',
	revert_suggestion: 'dismissed',
	save_skill: 'edited',
	edit_skill: 'edited',
	create_skill: 'created',
	create_skill_from_selection: 'created',
	restore_skill_version: 'restored a version',
	update_skill: 'updated',
	set_skill_pinned: 'pinned',
	propose_memory_change: 'proposed',
	export_document: 'exported',
	create_diagram: 'created',
	edit_diagram: 'edited',
	update_export_settings: 'updated',
	download_artifact: 'downloaded',
	delete_artifact: 'deleted',
	regenerate_artifact: 'created',

	// Reads. They earn a row like anything else — which note the agent read is how a
	// reader judges the answer it gave — and they land behind the door rather than in
	// the thread.
	search: 'searched',
	search_note: 'searched',
	ls: 'listed',
	grep: 'searched',
	sed: 'read an excerpt',
	search_icons: 'searched',
	find_references: 'searched',
	get_today_view: 'read',
	get_artifact: 'read',
	get_export_settings: 'read',
	diff_note_versions: 'read history',
	read_canvas_diagram: 'read',
	read_project_diagram: 'read',
	list_projects: 'listed',
	list_todos: 'listed',
	list_skills: 'listed',
	list_skill_versions: 'read history',
	list_artifacts: 'listed',
	list_attachments: 'listed',
	list_templates: 'listed',
	list_suggestions: 'listed',
	list_trashed_notes: 'listed',
	list_user_memory: 'read',
	list_project_memory: 'read'
};

const verbOf = (name: string): Verb | undefined =>
	Object.hasOwn(verbs, name) ? verbs[name as Exclude<AgentToolName, MechanismTool>] : undefined;

const text = (value: AgentPayload | undefined): string | undefined =>
	typeof value === 'string' && value.trim() ? value : undefined;

const identityOf = (entity: EntityRef): string => `${entity.kind}:${entity.id ?? entity.title}`;

const outcomeOf = (tool: ChatToolActivity): PassOutcome => {
	if (tool.status === 'running') return 'running';
	if (tool.status === 'rejected') return 'rejected';
	// Not `status === 'failed'`: a call can carry its failure in its result, which is how a
	// no-op `edit_note` came to be summarised as `edited`.
	return toolFailure(tool) !== undefined ? 'failed' : 'done';
};

/**
 * What the agent asked this call for.
 *
 * Most calls are named well enough by their own completed label — inside a row already titled
 * `atlas`, "Edited note" is the whole of what happened. The overrides are the calls whose
 * arguments are the point: a search is only judgeable against what it searched for, and an
 * excerpt against which lines it took.
 */
function passRequest(tool: ChatToolActivity): { label: string; query?: string } {
	const input = tool.arguments;
	if (tool.name === 'grep' || tool.name === 'search' || tool.name === 'search_note') {
		const query = text(input.pattern) ?? text(input.query);
		return {
			label: tool.status === 'running' ? 'Searching for' : 'Searched for',
			...(query ? { query } : {})
		};
	}
	if (tool.name === 'sed' && isAgentPayloadObject(input.range)) {
		const range = input.range;
		return {
			label:
				range.kind === 'to_end'
					? `Read from line ${String(range.startLine)}`
					: `Read lines ${String(range.startLine)}–${String(range.endLine)}`
		};
	}
	if (tool.name === 'propose_memory_change') {
		const operation = text(input.operation);
		return {
			label:
				operation === 'remove'
					? 'Proposed forgetting'
					: operation === 'update'
						? 'Proposed revising'
						: 'Proposed remembering'
		};
	}
	return {
		label: tool.status === 'running' ? friendlyToolLabel(tool.name) : completedToolLabel(tool.name)
	};
}

/**
 * The turn as it happens, in the order it happens.
 *
 * The fold is for auditing a turn that is over; while one is running the point is watching it
 * work, and a list that reordered itself under the reader as calls settled would be the worst
 * of both. Same passes, no fold, no rows for subjects — nothing here has finished being about
 * anything yet.
 */
export interface RunningStep {
	readonly label: string;
	readonly query?: string;
	/** Whether this step is changing the subject, marked while it happens rather than after. */
	readonly mutating: boolean;
	readonly outcome: PassOutcome;
}

export function runningSteps(tools: readonly ChatToolActivity[]): readonly RunningStep[] {
	return tools
		.filter((tool) => !mechanismTools.has(tool.name) && tool.status !== 'approval_required')
		.map((tool) => ({
			...passRequest(tool),
			// A tool with no verb is one this module does not classify, and a look is the weakest
			// thing it could be doing — the same reading `callEntries` takes.
			mutating: isWriteVerb(verbOf(tool.name) ?? 'read'),
			outcome: outcomeOf(tool)
		}));
}

/**
 * The lines of a file result that belong to one subject.
 *
 * A grep across the workspace hits several notes in one call, and each note's row must show
 * its own matches and nobody else's — that split is the whole reason the fold can absorb a
 * search at all. Lines with no source belong to the one subject the call was about.
 */
const linesFor = (
	lines: readonly FileOutputLine[],
	entity: EntityRef
): readonly FileOutputLine[] => {
	const owned = lines.filter(
		(line) => line.source && identityOf(line.source) === identityOf(entity)
	);
	return owned.length > 0 ? owned : lines.filter((line) => !line.source);
};

/** Why a look came back with nothing, when the tool troubled to say. */
function fileProblem(tool: ChatToolActivity, shell: ShellContext | undefined): string | undefined {
	const disclosure = toolDisclosure(tool, shell);
	return disclosure.kind === 'file-output' ? disclosure.problem : undefined;
}

/**
 * The memory a proposal would join, named as a place rather than as its own content.
 *
 * A remembered fact has no title, so the payload's `content` was standing in for one and the
 * row was headed by the whole proposed sentence — six lines of prose where every other row has
 * a name. The scope is the thing here: what is being remembered belongs inside, as the evidence
 * for a proposal about your project's memory or your profile.
 */
function memoryScope(
	tool: ChatToolActivity,
	shell: ShellContext | undefined
): EntityRef | undefined {
	if (toolPresentationKind(tool.name)?.kind !== 'memory') return undefined;
	const projectId = text(tool.arguments.projectId);
	if (!projectId)
		return {
			kind: 'memory',
			title: 'Your profile memory',
			named: true,
			destination: { kind: 'page', href: '/settings?tab=profile', label: 'Open profile memory' }
		};
	const project = shell?.projects.find((candidate) => candidate.id === projectId);
	return {
		kind: 'memory',
		title: `${project?.name ?? 'Project'} memory`,
		named: true,
		destination: {
			kind: 'page',
			href: `/projects/${projectId}/memory`,
			label: 'Open project memory'
		}
	};
}

/** One subject this call touched, and what it left there. */
interface CallEntry {
	readonly entity: EntityRef;
	readonly verb: Verb;
	readonly outcome: PassOutcome;
	readonly pass: SubjectPass;
}

/**
 * Which subjects a call touched, and the evidence it left on each.
 *
 * The disclosure has already resolved the payload into entities; this reads it the other way
 * round, asking not "what should this call show" but "whose row does this belong in".
 */
function callEntries(
	tool: ChatToolActivity,
	shell: ShellContext | undefined,
	verb: Verb
): readonly CallEntry[] {
	const disclosure = toolDisclosure(tool, shell);
	const request = passRequest(tool);
	const outcome = outcomeOf(tool);
	const entry = (entity: EntityRef, evidence: PassEvidence): CallEntry => ({
		entity,
		verb,
		outcome,
		pass: { ...request, mutating: isWriteVerb(verb), evidence }
	});

	if (disclosure.kind === 'failure') {
		const raw = toolFailure(tool) ?? 'The step did not complete.';
		const named = toolEntity(tool, shell);
		// A call that named nothing still failed, and the reader is owed a row for it. Named by
		// the tool, which is the only identity it has — printed as `[]` this was the one kind of
		// failure the surface could lose entirely.
		const entity: EntityRef =
			named.named || named.id
				? named
				: { kind: 'plain', title: friendlyToolLabel(tool.name), named: true };
		// Always evidence, never `none`: the cause lives behind this row's chevron now, and a
		// row with nothing behind it does not grow one.
		const cause = explainToolFailure(raw);
		return [entry(entity, { kind: 'failure', cause, ...(cause === raw ? {} : { raw }) })];
	}

	switch (disclosure.kind) {
		case 'none':
			return [];

		case 'file-output': {
			// A look that came back with nothing touched nothing. Falling through to the path it
			// was pointed at would open a row for `Workspace files` on every fruitless grep —
			// the agent looked there, it is not something it found.
			if (disclosure.lines.length === 0) return [];
			const path = text(tool.arguments.path);
			const sources = disclosure.sources.length
				? disclosure.sources
				: path
					? [fileEntity(path, shell)]
					: [];
			return sources.map((source) =>
				entry(source, { kind: 'passages', lines: linesFor(disclosure.lines, source) })
			);
		}

		case 'collection':
		case 'created':
			return disclosure.entities.map((entity) => entry(entity, { kind: 'none' }));

		case 'link':
			return [entry(disclosure.entity, { kind: 'none' })];

		case 'record': {
			const entity = disclosure.entity ?? toolEntity(tool, shell);
			if (!entity.named && !entity.id) return [];
			return [
				entry(
					entity,
					disclosure.changed.length > 0
						? { kind: 'fields', changed: disclosure.changed }
						: { kind: 'none' }
				)
			];
		}

		case 'lifecycle': {
			const entity = disclosure.entity ?? toolEntity(tool, shell);
			if (!entity.named && !entity.id) return [];
			return [
				entry(entity, {
					kind: 'prose',
					text: disclosure.recoverable ? 'This can be undone.' : 'This cannot be undone.'
				})
			];
		}

		case 'proposal': {
			// A proposal still awaiting a decision is on screen above in full, as the change the
			// reader is being asked to make. Listing it here says the same thing twice.
			if (tool.status === 'approval_required') return [];
			const entity = memoryScope(tool, shell) ?? toolEntity(tool, shell);
			if (!entity.named && !entity.id) return [];
			return [
				entry(
					entity,
					disclosure.content ? { kind: 'prose', text: disclosure.content } : { kind: 'none' }
				)
			];
		}
	}
}

export function turnContext(tools: readonly ChatToolActivity[], shell?: ShellContext): TurnContext {
	const order: string[] = [];
	const subjects = new Map<string, SubjectActivity>();
	const barren: SubjectPass[] = [];
	const setup: string[] = [];

	for (const tool of tools) {
		if (mechanismTools.has(tool.name)) {
			const label = friendlyToolLabel(tool.name);
			if (!setup.includes(label)) setup.push(label);
			continue;
		}
		const verb = verbOf(tool.name);
		// A name the catalogue has never seen — an MCP tool from another host. It is work, and
		// the weakest verb is the only honest thing to say about it.
		const entries = callEntries(tool, shell, verb ?? 'read');
		if (entries.length === 0) {
			if (tool.status !== 'approval_required') {
				const problem = fileProblem(tool, shell);
				barren.push({
					...passRequest(tool),
					mutating: isWriteVerb(verb ?? 'read'),
					evidence: problem ? { kind: 'prose', text: problem } : { kind: 'none' }
				});
			}
			continue;
		}
		for (const found of entries) {
			const key = identityOf(found.entity);
			const existing = subjects.get(key);
			if (!existing) {
				order.push(key);
				subjects.set(key, {
					entity: found.entity,
					verb: found.verb,
					outcome: found.outcome,
					passes: [found.pass]
				});
				continue;
			}
			subjects.set(key, {
				// A later call that resolved a name wins over a placeholder.
				entity: found.entity.named ? found.entity : existing.entity,
				verb: strongerVerb(existing.verb, found.verb),
				// A failure a later call on the same subject made good is a retry, not news, so
				// the last call on a subject is what its row reports.
				outcome: found.outcome,
				passes: [...existing.passes, found.pass]
			});
		}
	}

	const all = order
		.map((key) => subjects.get(key) as SubjectActivity)
		.filter((subject) => !recovered(subject, tools));
	const changed = all.filter((subject) => !readVerbs.has(subject.verb));
	const read = all.filter((subject) => readVerbs.has(subject.verb));

	return { changed, read, barren, setup };
}

/**
 * A failure a later call put right is a retry, not news.
 *
 * For a named subject the fold has already answered this: the last call on it decides its
 * outcome, so a save that eventually worked leaves a row that did not fail. A subject named
 * only by its tool cannot be matched that way — the successful retry named a real entity and
 * folded somewhere else entirely — so the tool is the identity, and a later success under the
 * same name means the turn recovered.
 */
function recovered(subject: SubjectActivity, tools: readonly ChatToolActivity[]): boolean {
	if (subject.outcome !== 'failed' || subject.entity.kind !== 'plain') return false;
	return tools.some(
		(tool) => tool.status === 'succeeded' && friendlyToolLabel(tool.name) === subject.entity.title
	);
}

/**
 * What the door onto the read subjects says, in the reader's terms.
 *
 * A count of tool calls was the old label and it named mechanism: "called 6 tools" tells you
 * how hard it worked, never what it worked from. This counts subjects, and only where they are
 * not on screen — the rule the rest of this surface follows.
 */
export function readDoorLabel(context: TurnContext): string {
	const kinds = new Map<string, number>();
	for (const subject of context.read)
		kinds.set(subject.entity.kind, (kinds.get(subject.entity.kind) ?? 0) + 1);
	const nouns: Readonly<Record<string, readonly [string, string]>> = {
		note: ['note', 'notes'],
		folder: ['folder', 'folders'],
		attachment: ['attachment', 'attachments'],
		todo: ['todo', 'todos'],
		project: ['project', 'projects'],
		skill: ['skill', 'skills'],
		diagram: ['diagram', 'diagrams'],
		artifact: ['file', 'files'],
		memory: ['remembered fact', 'remembered facts'],
		suggestion: ['suggestion', 'suggestions'],
		setting: ['setting', 'settings'],
		plain: ['item', 'items']
	};
	const parts = [...kinds.entries()].map(([kind, count]) => {
		const noun = nouns[kind] ?? nouns.plain;
		return `${count} ${count === 1 ? noun[0] : noun[1]}`;
	});
	if (parts.length === 0) return 'What it looked at';
	const listed =
		parts.length === 1
			? parts[0]
			: `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
	return `Read ${listed}`;
}
