import {
	readAgentPayload,
	readAgentPayloadObject,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { readToolFailure } from '$lib/models/agent/tool-failure';

export type ChatToolStatus = 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';

/** What every tool row carries, whatever became of the call. */
export interface ChatToolActivityBase {
	readonly callId: string;
	readonly name: string;
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
	| (ChatToolActivityBase & { readonly status: 'failed'; readonly failure: string })
	| (ChatToolActivityBase & { readonly status: 'rejected' });

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
export const CORRUPT_OUTPUT = 'The tool returned a result this app could not read.';

/**
 * Arguments, or none recorded.
 *
 * `{}` is not an invented default here: it is already this module's word for
 * "this event does not restate the arguments" — `tool_completed` sends exactly
 * that, and `mergeToolActivity` keeps the earlier row's arguments when it sees
 * it. A payload that is not a JSON object records no arguments in the same
 * sense, and the surfaces are already total over the empty case.
 */
export const toolArguments = (value: unknown): AgentPayloadObject => {
	const read = readAgentPayloadObject(value);
	return read.kind === 'valid' ? read.value : {};
};

/**
 * The settled arm for a call the run says succeeded.
 *
 * An unreadable result does not become a `succeeded` row with no output. That
 * would report "the tool returned nothing", which is a different fact from "the
 * tool returned something nobody here can read", and reporting the first when
 * the second happened is the case ADR 0015 exists for — the reader cannot tell
 * whether the work they asked for happened.
 */
export const settledTool = (base: ChatToolActivityBase, output: unknown): ChatToolActivity => {
	if (output === undefined || output === null) return { ...base, status: 'succeeded' };
	const read = readAgentPayload(output);
	return read.kind === 'valid'
		? { ...base, output: read.value, status: 'succeeded' }
		: { ...base, failure: `${CORRUPT_OUTPUT} ${read.message}`, status: 'failed' };
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
export const toolOutput = (tool: ChatToolActivity): AgentPayload | undefined =>
	tool.status === 'succeeded' ? tool.output : undefined;

/**
 * What went wrong, when something did.
 *
 * Two ways a call can have failed, and reading only the first is how a failure
 * came to look like a success. `edit_note` returns `{ failure, problems }` as a
 * *value* rather than throwing, deliberately and for a good reason — a throw is
 * stringified to a bare message and strips the occurrence counts and nearest
 * matches the model needs to correct itself on the next turn (ADR 0035). But
 * the run still journals that call as `succeeded`, so nothing downstream saw
 * it: a no-op edit rendered "Edited note · <title>" in ordinary colour and the
 * turn's touched list claimed the verb `edited`. ADR 0015 forbids exactly that
 * — the user could not tell whether the requested work happened.
 *
 * The server contract does not move. This reads the failure where it actually
 * is, so a single question — "did this call fail?" — has a single answer.
 */
export const toolFailure = (tool: ChatToolActivity): string | undefined =>
	tool.status === 'failed'
		? tool.failure
		: tool.status === 'succeeded'
			? readToolFailure(tool.output)
			: undefined;

/** Whether the call failed, by either route. */
export const toolFailed = (tool: ChatToolActivity): boolean => toolFailure(tool) !== undefined;
