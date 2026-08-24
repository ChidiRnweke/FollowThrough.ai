import type { ChatPart } from '$lib/stores/agent/chat.svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';

/**
 * A turn, in the order it happened.
 *
 * There is one placement rule and it is chronology: every group renders where it occurred,
 * and the turn only ever grows downward. Reporting settled calls at the end of the turn while
 * approvals stayed in flow gave a turn two competing placements, and nothing told the reader
 * which one to look at.
 *
 * Two kinds of run are folded, both only across *consecutive* parts. Anything the model said
 * between two calls means they belong to different moments, and merging across it would
 * misrepresent the turn:
 *
 *  - `activity` — calls that have run. Folded so three reads of one note are one line.
 *  - `approvals` — calls parked for a decision. Rendered one card per call, the user is asked
 *    the same question three times over about work the model decided on together.
 */
export type ChatPartGroup =
	| { readonly kind: 'part'; readonly part: ChatPart }
	| { readonly kind: 'activity'; readonly tools: ChatToolActivity[] }
	| { readonly kind: 'approvals'; readonly tools: ChatToolActivity[] };

type ToolPart = { kind: 'tool'; tool: ChatToolActivity };

const isToolPart = (part: ChatPart): part is ToolPart => part.kind === 'tool';

const isPendingApproval = (part: ChatPart): part is ToolPart =>
	isToolPart(part) && part.tool.status === 'approval_required';

export function groupChatParts(parts: readonly ChatPart[]): ChatPartGroup[] {
	const groups: ChatPartGroup[] = [];
	for (const part of parts) {
		if (!isToolPart(part)) {
			groups.push({ kind: 'part', part });
			continue;
		}
		const kind = isPendingApproval(part) ? 'approvals' : 'activity';
		const last = groups.at(-1);
		if (last?.kind === kind) last.tools.push(part.tool);
		else groups.push({ kind, tools: [part.tool] });
	}
	return groups;
}

/**
 * A stable key for the `{#each}` that renders the groups.
 *
 * The empty string is not a call id. A restored row gets
 * `callId: String(content.callId ?? '')`, and providers that report an outcome
 * without an id leave it empty — so `?? index` was not enough: it catches an
 * absent id and passes an empty one straight through. Two groups whose first
 * tool had no id both keyed as `activity-`, and a duplicate key in a keyed
 * `{#each}` throws — which the `ErrorBoundary` around the thread then turned
 * into the whole turn rendering as nothing.
 */
export const chatPartGroupKey = (group: ChatPartGroup, index: number): string => {
	if (group.kind !== 'part') return `${group.kind}-${group.tools[0]?.callId || index}`;
	return group.part.kind === 'tool' && group.part.tool.callId
		? group.part.tool.callId
		: `part-${index}`;
};
