export type ChatToolStatus = 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';

/** What every tool row carries, whatever became of the call. */
interface ChatToolActivityBase {
	readonly callId: string;
	readonly name: string;
	readonly arguments: Readonly<Record<string, unknown>>;
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
	| (ChatToolActivityBase & { readonly status: 'succeeded'; readonly output?: unknown })
	| (ChatToolActivityBase & { readonly status: 'failed'; readonly failure: string })
	| (ChatToolActivityBase & { readonly status: 'rejected' });

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
 */
export const toolOutput = (tool: ChatToolActivity): unknown =>
	tool.status === 'succeeded' ? tool.output : undefined;

/** What went wrong, when something did. */
export const toolFailure = (tool: ChatToolActivity): string | undefined =>
	tool.status === 'failed' ? tool.failure : undefined;
