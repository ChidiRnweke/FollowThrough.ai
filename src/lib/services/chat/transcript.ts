import type { MutableChatPart, MutableChatEntry } from '$lib/models/chat';
import type { ChatJournalMessage } from '$lib/models/chat';
import type { ChatToolActivity } from '$lib/models/chat';
import type { ChatEntry } from '$lib/models/chat';
import type { AgentPayload } from '$lib/models/agent/payload';
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
const matchToolActivity = (
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
const mergeToolActivity = (
	existing: ChatToolActivity,
	incoming: ChatToolActivity
): ChatToolActivity => ({
	...incoming,
	callId: incoming.callId || existing.callId,
	arguments: Object.keys(incoming.arguments).length > 0 ? incoming.arguments : existing.arguments,
	...((incoming.runId ?? existing.runId) ? { runId: incoming.runId ?? existing.runId } : {})
});

/** The failed arm, for readers that have narrowed to it and want to keep it. */

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
const toolOutput = (tool: ChatToolActivity): AgentPayload | undefined => {
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
 * `edit_note` returns `{ kind: 'failure', code, message, recovery, details }` as a *value* rather than throwing
 * (ADR 0035) and the run journalled that call as a success, so nothing
 * downstream saw it: a no-op edit rendered "Edited note · <title>" in ordinary
 * colour and the turn's touched list claimed the verb `edited`. The classifier
 * moved to the run, where the value is produced, and a call that reports its own
 * failure now arrives already in the arm that says so.
 */
const toolFailure = (tool: ChatToolActivity): string | undefined =>
	tool.status === 'failed' || tool.status === 'reported_failure' ? tool.failure : undefined;

/** The prose of a turn, with tool activity left out. */
const entryText = (entry: ChatEntry): string =>
	entry.parts
		.filter((part) => part.kind === 'text')
		.map((part) => part.text)
		.join('\n');

/** Every tool call of one turn, in call order — what the turn's activity summary reads. */
const entryTools = (entry: ChatEntry): ChatToolActivity[] =>
	entry.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);

const applyToolActivity = (parts: MutableChatPart[], incoming: ChatToolActivity): void => {
	const toolParts = parts.filter((part) => part.kind === 'tool');
	const index = matchToolActivity(
		toolParts.map((part) => part.tool),
		incoming
	);
	if (index === undefined) {
		parts.push({ kind: 'tool', tool: incoming });
		return;
	}
	const part = toolParts[index]!;
	part.tool = mergeToolActivity(part.tool, incoming);
};

const appendText = (entry: MutableChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'text') last.text += text;
	else entry.parts.push({ kind: 'text', text });
};

const appendReasoning = (entry: MutableChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'reasoning') last.text += text;
	else entry.parts.push({ kind: 'reasoning', text });
};

const restoreEntries = (
	messages: readonly ChatJournalMessage[],
	awaitingRunId?: string
): MutableChatEntry[] => {
	const entries: MutableChatEntry[] = [];
	let turn: { runId?: string; messages: ChatJournalMessage[] } | undefined;
	const flush = (): void => {
		if (!turn?.messages.length) return;
		const first = turn.messages[0]!;
		const parts: MutableChatPart[] = [];
		for (const message of [...turn.messages].sort((a, b) => {
			if (a.eventCursor === undefined) return b.eventCursor === undefined ? 0 : 1;
			if (b.eventCursor === undefined) return -1;
			return BigInt(a.eventCursor) < BigInt(b.eventCursor)
				? -1
				: BigInt(a.eventCursor) > BigInt(b.eventCursor)
					? 1
					: 0;
		})) {
			for (const part of message.parts) {
				if (part.kind !== 'tool') parts.push({ ...part });
				else
					applyToolActivity(
						parts,
						part.tool.status === 'approval_required' && message.runId !== awaitingRunId
							? { ...part.tool, status: 'failed', failure: 'The run ended before you answered.' }
							: part.tool
					);
			}
		}
		entries.push({
			id: first.id,
			role: 'assistant',
			parts,
			suggestions: [],
			status: 'completed',
			...(turn.runId ? { runId: turn.runId as MutableChatEntry['runId'] } : {})
		});
		turn = undefined;
	};
	for (const message of messages) {
		if (message.role === 'user') {
			flush();
			entries.push({
				id: message.id,
				role: 'user',
				parts: message.parts.map((part) => ({ ...part })),
				suggestions: [],
				status: 'completed',
				...(message.runId ? { runId: message.runId } : {})
			});
			continue;
		}
		if (turn && message.runId && turn.runId && message.runId !== turn.runId) flush();
		if (!turn) turn = { ...(message.runId ? { runId: message.runId } : {}), messages: [] };
		else if (!turn.runId && message.runId) turn.runId = message.runId;
		turn.messages.push(message);
	}
	flush();
	return entries;
};

export interface ChatTranscript {
	restore(messages: readonly ChatJournalMessage[], awaitingRunId?: string): MutableChatEntry[];
	applyTool(parts: MutableChatPart[], incoming: ChatToolActivity): void;
	appendText(entry: MutableChatEntry, text: string): void;
	appendReasoning(entry: MutableChatEntry, text: string): void;

	entryText(entry: ChatEntry): string;
	entryTools(entry: ChatEntry): ChatToolActivity[];
	toolOutput(tool: ChatToolActivity): AgentPayload | undefined;
	toolFailure(tool: ChatToolActivity): string | undefined;
}
export class ChatTranscriptService implements ChatTranscript {
	restore(messages: readonly ChatJournalMessage[], awaitingRunId?: string): MutableChatEntry[] {
		return restoreEntries(messages, awaitingRunId);
	}
	applyTool(parts: MutableChatPart[], incoming: ChatToolActivity): void {
		return applyToolActivity(parts, incoming);
	}
	appendText(entry: MutableChatEntry, text: string): void {
		return appendText(entry, text);
	}
	appendReasoning(entry: MutableChatEntry, text: string): void {
		return appendReasoning(entry, text);
	}

	entryText(entry: ChatEntry): string {
		return entryText(entry);
	}
	entryTools(entry: ChatEntry): ChatToolActivity[] {
		return entryTools(entry);
	}
	toolOutput(tool: ChatToolActivity): AgentPayload | undefined {
		return toolOutput(tool);
	}
	toolFailure(tool: ChatToolActivity): string | undefined {
		return toolFailure(tool);
	}
}
