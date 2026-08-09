export type ChatToolStatus = 'running' | 'approval_required' | 'succeeded' | 'failed' | 'rejected';

export interface ChatToolActivity {
	callId: string;
	name: string;
	arguments: Readonly<Record<string, unknown>>;
	runId?: string;
	output?: unknown;
	failure?: string;
	status: ChatToolStatus;
}

/**
 * Names that identify the dispatch mechanism rather than the work. A row labelled by one of
 * these tells the reader nothing they could act on, so they never overwrite a resolved name.
 */
const wrapperNames = new Set(['tool', 'use_tool']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The payload a `use_tool` envelope carries, in either shape the server accepts: the
 * documented nested `payload`, or the flat `arguments` that models which cannot build a
 * nested object emit instead — as an object or as a JSON string. Mirrors
 * `resolveUseToolPayload` on the server, which this module may not import from.
 */
const envelopePayload = (args: Readonly<Record<string, unknown>>): Record<string, unknown> => {
	if (isRecord(args.payload)) return args.payload;
	if (isRecord(args.arguments)) return args.arguments;
	if (typeof args.arguments === 'string') {
		try {
			const parsed: unknown = JSON.parse(args.arguments);
			if (isRecord(parsed)) return parsed;
		} catch {
			/* an unparseable envelope keeps its raw arguments, below */
		}
	}
	return {};
};

/**
 * Most capabilities reach the agent through the `use_tool` meta-tool, whose arguments are the
 * envelope `{ name, payload }`. Left wrapped, every such call renders as "Use tool" with the
 * subject it acts on — the note id, the title — buried a level down where no label, note
 * link or approval preview can see it. Unwrapping here means the whole chat surface works on
 * real tool names.
 *
 * An envelope that names no tool is returned untouched: a malformed call must still show as
 * what it was rather than disappear behind a name nobody sent.
 */
export const unwrapToolCall = <
	T extends { name: string; arguments: Readonly<Record<string, unknown>> }
>(
	call: T
): T => {
	if (call.name !== 'use_tool') return call;
	const name = call.arguments.name;
	if (typeof name !== 'string' || name.length === 0) return call;
	return { ...call, name, arguments: envelopePayload(call.arguments) };
};

const activeTools = (tools: ChatToolActivity[]): ChatToolActivity[] =>
	tools.filter((tool) => tool.status === 'running' || tool.status === 'approval_required');

const fallbackTool = (
	tools: ChatToolActivity[],
	incoming: ChatToolActivity
): ChatToolActivity | undefined => {
	if (incoming.status === 'running') return undefined;
	const active = activeTools(tools);
	const matchingName = active.filter(
		(tool) => wrapperNames.has(incoming.name) || tool.name === incoming.name
	);
	if (matchingName.length > 0) return matchingName.at(-1);
	return active.length === 1 ? active[0] : undefined;
};

/**
 * Merge lifecycle events so one tool call always occupies one row in the chat.
 * Returns the merged activity, or undefined when no existing activity matches —
 * the caller decides where a new activity is inserted.
 */
export const reconcileToolActivity = (
	tools: ChatToolActivity[],
	incoming: ChatToolActivity
): ChatToolActivity | undefined => {
	// The fallback is for providers that report an outcome without an id. An event that
	// *has* an id and matches nothing is a different call — when a turn parks on two
	// approvals at once, falling back would fold the second onto the first and lose it.
	const existing = incoming.callId
		? tools.find((tool) => tool.callId === incoming.callId)
		: fallbackTool(tools, incoming);
	if (!existing) return undefined;

	if (incoming.callId) existing.callId = incoming.callId;
	// A completion for a `use_tool` call arrives named after the wrapper with no arguments;
	// letting it through would undo the unwrapping the start event made possible.
	if (!wrapperNames.has(incoming.name)) existing.name = incoming.name;
	if (Object.keys(incoming.arguments).length > 0) existing.arguments = incoming.arguments;
	existing.status = incoming.status;
	if ('runId' in incoming) existing.runId = incoming.runId;
	if ('output' in incoming) existing.output = incoming.output;
	if ('failure' in incoming) existing.failure = incoming.failure;
	return existing;
};
