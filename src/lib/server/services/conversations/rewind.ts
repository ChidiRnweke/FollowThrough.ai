/**
 * Rewinding provider session memory to just before a user turn.
 *
 * Editing or re-asking a question sends it as the input of a brand new run, so
 * the discarded turn has to leave session memory first — otherwise the agent
 * replays a transcript that still contains the question it is being asked again.
 * The turn is addressed by its one-based position among user items: only items
 * carrying `role: 'user'` count, because tool calls and tool outputs carry no
 * role at all.
 */
export type SessionItem = Readonly<Record<string, unknown>>;

const isUserItem = (item: SessionItem): boolean => item.role === 'user';

/**
 * The prefix of `items` that precedes the `ordinal`-th user item, or `undefined`
 * when there is no such item and nothing needs rewinding.
 */
export function rewindToUserItem(
	items: readonly SessionItem[],
	ordinal: number
): readonly SessionItem[] | undefined {
	if (ordinal < 1) return undefined;
	const userIndices = items.reduce<number[]>((indices, item, index) => {
		if (isUserItem(item)) indices.push(index);
		return indices;
	}, []);
	const cut = userIndices[ordinal - 1];
	return cut === undefined ? undefined : items.slice(0, cut);
}
