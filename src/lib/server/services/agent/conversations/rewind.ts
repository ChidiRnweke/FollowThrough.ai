/**
 * Rewinding provider session memory to just before a user turn.
 *
 * Editing or re-asking a question sends it as the input of a brand new run, so
 * the discarded turn has to leave session memory first — otherwise the agent
 * replays a transcript that still contains the question it is being asked again.
 * The turn is addressed by its one-based position among user items: only the
 * `user_message` arm counts, because tool calls and tool outputs are not a turn
 * anyone can be sent back to.
 */
import type { PersistedSessionItem } from '$lib/models/agent';

const isUserItem = (item: PersistedSessionItem): boolean => item.type === 'user_message';

/**
 * The prefix of `items` that precedes the `ordinal`-th user item, or `undefined`
 * when there is no such item and nothing needs rewinding.
 */
export function rewindToUserItem(
	items: readonly PersistedSessionItem[],
	ordinal: number
): readonly PersistedSessionItem[] | undefined {
	if (ordinal < 1) return undefined;
	const userIndices = items.reduce<number[]>((indices, item, index) => {
		if (isUserItem(item)) indices.push(index);
		return indices;
	}, []);
	const cut = userIndices[ordinal - 1];
	return cut === undefined ? undefined : items.slice(0, cut);
}
