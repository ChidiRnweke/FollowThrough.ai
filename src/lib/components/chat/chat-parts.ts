import type { ChatPart } from '$lib/stores/agent/chat.svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';

/**
 * A turn can park on several tool calls at once. Rendered one card per call, the user is
 * asked the same question three times over about work the model decided on together — so
 * calls that parked side by side are reviewed and answered as one bundle.
 */
export type ChatPartGroup =
	| { readonly kind: 'part'; readonly part: ChatPart }
	| { readonly kind: 'approvals'; readonly tools: ChatToolActivity[] };

const isPendingApproval = (part: ChatPart): part is { kind: 'tool'; tool: ChatToolActivity } =>
	part.kind === 'tool' && part.tool.status === 'approval_required';

/**
 * Only *consecutive* pending approvals bundle: anything the model said or did between two
 * calls means they belong to different moments, and merging them would misrepresent the turn.
 */
export function groupChatParts(parts: readonly ChatPart[]): ChatPartGroup[] {
	const groups: ChatPartGroup[] = [];
	for (const part of parts) {
		if (!isPendingApproval(part)) {
			groups.push({ kind: 'part', part });
			continue;
		}
		const last = groups.at(-1);
		if (last?.kind === 'approvals') last.tools.push(part.tool);
		else groups.push({ kind: 'approvals', tools: [part.tool] });
	}
	return groups;
}

/** A stable key for the `{#each}` that renders the groups. */
export const chatPartGroupKey = (group: ChatPartGroup, index: number): string => {
	if (group.kind === 'approvals') return `approvals-${group.tools[0]?.callId ?? index}`;
	return group.part.kind === 'tool' && group.part.tool.callId
		? group.part.tool.callId
		: `part-${index}`;
};
