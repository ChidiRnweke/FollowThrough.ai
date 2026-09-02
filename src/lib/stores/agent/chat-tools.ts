/**
 * The client's parse zone for tool payloads.
 *
 * Arguments and results reach the client two ways — off the run's event stream,
 * and out of a journalled message row — and both are JSON both times. They were
 * carried inward as `unknown` anyway, which is what made five presentation
 * modules invent a `Record<string, unknown>` guard apiece. Reading them once
 * here, where they arrive, is what lets `ChatToolActivity` name the shape.
 *
 * It runs per event rather than per render, so a large result is walked once.
 */
import { z } from 'zod';
import {
	readAgentPayloadObject,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { agentToolNameSchema } from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';

export type ChatToolStatus =
	'running' | 'approval_required' | 'succeeded' | 'reported_failure' | 'failed' | 'rejected';

/** What every tool row carries, whatever became of the call. */
export interface ChatToolActivityBase {
	/** Absent when the provider reported the outcome without one; see `matchToolActivity`. */
	readonly callId?: string;
	readonly name: AgentToolName;
	readonly arguments: AgentPayloadObject;
	/** The run that produced it. Restored rows from before a run existed have none. */
	readonly runId?: string;
}

/**
 * One tool call as the transcript shows it.
 *
 * The client twin of `ToolActivity`, with one extra arm: `rejected` is what the
 * user just did to a parked approval, applied here before the run has caught up.
 *
 * Discriminated on `status` for the reason the model type gives — the payload
 * belongs to the arm that can have it. Two consequences worth knowing:
 * `tool.failure` does not typecheck until `status === 'failed'` has been
 * established, which is what retires the hand-written
 * `tool is ChatToolActivity & { failure: string }` predicate in `turn-activity`;
 * and a row cannot be moved from one arm to another by assignment, so a call
 * that settles replaces its row rather than being edited in place.
 */
export type ChatToolActivity =
	| (ChatToolActivityBase & { readonly status: 'running' })
	| (ChatToolActivityBase & { readonly status: 'approval_required' })
	| (ChatToolActivityBase & { readonly status: 'succeeded'; readonly output?: AgentPayload })
	/** The tool returned, and what it returned says it failed (ADR 0035). */
	| (ChatToolActivityBase & {
			readonly status: 'reported_failure';
			readonly failure: string;
			readonly output: AgentPayload;
	  })
	| (ChatToolActivityBase & { readonly status: 'failed'; readonly failure: string })
	| (ChatToolActivityBase & { readonly status: 'rejected' });

/**
 * Arguments, or none recorded.
 *
 * `{}` is not an invented default here: it is already this module's word for
 * "this event does not restate the arguments" — an outcome event sends exactly
 * that, and `mergeToolActivity` keeps the earlier row's arguments when it sees
 * it. A payload that is not a JSON object records no arguments in the same
 * sense, and the surfaces are already total over the empty case.
 */
export const toolArguments = (value: unknown): AgentPayloadObject => {
	const read = readAgentPayloadObject(value);
	return read.kind === 'valid' ? read.value : {};
};

/**
 * One journalled `tool_activity` row as a transcript row, or the reason it could
 * not be read.
 *
 * The journal is JSON with no schema behind it, and this used to be read with
 * `String(content.callId ?? '')`, `String(content.status ?? 'succeeded') as
 * ChatToolStatus`, and a bare `typeof` for the failure — three different guesses
 * about one stored shape, one of which could mint a status no arm of this union
 * has. An id the row does not carry stays absent, because that absence is what
 * `matchToolActivity` settles a row by.
 */
export type JournalledTool =
	| { readonly kind: 'readable'; readonly tool: ChatToolActivity }
	| { readonly kind: 'unreadable'; readonly reason: string };

const journalledToolSchema = z.object({
	callId: z.string().nullish(),
	// A journalled row naming a tool the agent surface no longer has becomes an
	// `unreadable` transcript part rather than a row nothing can label.
	// `tests/unit/corpus.spec.ts` holds that at zero against the stored messages.
	name: agentToolNameSchema,
	input: z.custom<AgentPayload>(() => true).optional(),
	output: z.custom<AgentPayload>(() => true).optional(),
	failure: z.string().nullish(),
	status: z.enum(['running', 'approval_required', 'succeeded', 'reported_failure', 'failed'])
});

export const readJournalledTool = (
	content: unknown,
	provenance: { readonly runId?: string }
): JournalledTool => {
	const parsed = journalledToolSchema.safeParse(content);
	if (!parsed.success) return { kind: 'unreadable', reason: z.prettifyError(parsed.error) };
	const row = parsed.data;
	const base: ChatToolActivityBase = {
		...(row.callId ? { callId: row.callId } : {}),
		name: row.name,
		arguments: toolArguments(row.input ?? {}),
		...(provenance.runId ? { runId: provenance.runId } : {})
	};
	// `null` is how the archive spells an absent optional, because the wire type
	// cannot carry `undefined`. Both spellings mean the field is not there.
	const output = row.output ?? undefined;
	const failure = row.failure ?? undefined;
	if (row.status === 'running' || row.status === 'approval_required')
		return { kind: 'readable', tool: { ...base, status: row.status } };
	if (row.status === 'succeeded')
		return {
			kind: 'readable',
			tool: { ...base, ...(output === undefined ? {} : { output }), status: 'succeeded' }
		};
	// A settled row that says it failed and does not say how, or that reported a
	// failure without the value it read it out of, is a row this reader cannot
	// reconstruct — the writer always supplies both.
	if (failure === undefined)
		return { kind: 'unreadable', reason: `a ${row.status} row carries no failure` };
	if (row.status === 'failed')
		return { kind: 'readable', tool: { ...base, failure, status: 'failed' } };
	return output === undefined
		? { kind: 'unreadable', reason: 'a reported_failure row carries no output' }
		: { kind: 'readable', tool: { ...base, failure, output, status: 'reported_failure' } };
};

const isActive = (tool: ChatToolActivity): boolean =>
	tool.status === 'running' || tool.status === 'approval_required';

const fallbackIndex = (
	tools: readonly ChatToolActivity[],
	incoming: ChatToolActivity
): number | undefined => {
	if (incoming.status === 'running') return undefined;
	const active = tools
		.map((tool, index) => ({ tool, index }))
		.filter((entry) => isActive(entry.tool));
	const matchingName = active.filter((entry) => entry.tool.name === incoming.name);
	if (matchingName.length > 0) return matchingName.at(-1)!.index;
	return active.length === 1 ? active[0]!.index : undefined;
};

/**
 * Which row an incoming event settles, or `undefined` when it opens a new one.
 *
 * The fallback is for providers that report an outcome without an id. An event
 * that *has* an id and matches nothing is a different call — when a turn parks
 * on two approvals at once, falling back would fold the second onto the first
 * and lose it.
 */
export const matchToolActivity = (
	tools: readonly ChatToolActivity[],
	incoming: ChatToolActivity
): number | undefined => {
	if (!incoming.callId) return fallbackIndex(tools, incoming);
	const index = tools.findIndex((tool) => tool.callId === incoming.callId);
	return index === -1 ? undefined : index;
};

/**
 * Merge lifecycle events so one tool call always occupies one row in the chat.
 *
 * Answers a new row rather than editing the old one: the incoming event decides
 * which arm the call is now in, and an object cannot be mutated across arms.
 * That also settles a question the in-place version answered by accident — a
 * call driven back to `running` no longer carries the output of the attempt
 * before it, because the arm it is now in has nowhere to keep one.
 *
 * What the event does not restate, the row keeps: `tool_completed` arrives with
 * empty arguments, and the arguments are the only record of what was called.
 */
export const mergeToolActivity = (
	existing: ChatToolActivity,
	incoming: ChatToolActivity
): ChatToolActivity => ({
	...incoming,
	callId: incoming.callId || existing.callId,
	arguments: Object.keys(incoming.arguments).length > 0 ? incoming.arguments : existing.arguments,
	...((incoming.runId ?? existing.runId) ? { runId: incoming.runId ?? existing.runId } : {})
});

/** The failed arm, for readers that have narrowed to it and want to keep it. */
export type FailedToolActivity = Extract<ChatToolActivity, { readonly status: 'failed' }>;

/**
 * What a call produced, if it got as far as producing anything.
 *
 * A function of the discriminant rather than a field read, so "did it succeed,
 * and with what" is asked once here instead of at each of the fifteen sites
 * that used to reach for `tool.output` and get `undefined` from a call that had
 * not run yet, one that had failed, and one that succeeded returning nothing —
 * three different facts arriving as the same value.
 *
 * What comes back is JSON or nothing. The event reader parsed it on the way in,
 * so a caller narrows it with an ordinary `typeof` test and indexes it without a
 * guard — the four hand-rolled `isRecord` predicates that used to stand between
 * this function and its readers had nothing left to do.
 */
export const toolOutput = (tool: ChatToolActivity): AgentPayload | undefined => {
	if (tool.status === 'succeeded') return tool.output;
	// A reported failure carries the value the failure was read out of, and the
	// disclosure surfaces render it: the occurrence counts and nearest matches an
	// `edit_note` failure attaches are the whole reason it returns a value.
	return tool.status === 'reported_failure' ? tool.output : undefined;
};

/**
 * What went wrong, when something did.
 *
 * One field read now, off whichever arm carries it. It used to be two questions
 * asked here — `tool.failure` when the row said `failed`, and
 * `readToolFailure(tool.output)` when it said `succeeded` — because
 * `edit_note` returns `{ failure, problems }` as a *value* rather than throwing
 * (ADR 0035) and the run journalled that call as a success, so nothing
 * downstream saw it: a no-op edit rendered "Edited note · <title>" in ordinary
 * colour and the turn's touched list claimed the verb `edited`. The classifier
 * moved to the run, where the value is produced, and a call that reports its own
 * failure now arrives already in the arm that says so.
 */
export const toolFailure = (tool: ChatToolActivity): string | undefined =>
	tool.status === 'failed' || tool.status === 'reported_failure' ? tool.failure : undefined;

/** Whether the call failed. */
export const toolFailed = (tool: ChatToolActivity): boolean => toolFailure(tool) !== undefined;
