import type { OutputSegment, StoredAgentRunEventRecord } from '$lib/models/agent';

/**
 * Reconstruct a turn's text and reasoning without merging across intervening activity.
 */
export const segmentOutput = (
	records: readonly StoredAgentRunEventRecord[]
): readonly OutputSegment[] => {
	const segments: { kind: 'text' | 'reasoning'; text: string; cursor: string }[] = [];
	// `open` is what makes this faithful rather than merely grouped: anything else in the
	// stream — a tool call above all — closes the current run. Merged across a call, a
	// sentence spoken after the work would carry the cursor from before it and be replayed
	// ahead of the work it describes.
	let open: (typeof segments)[number] | undefined;
	for (const record of records) {
		// An unreadable row closes the open segment rather than being skipped. It is
		// something that happened between two runs of output, and merging across it
		// would give the second run the first one's cursor.
		if (record.kind === 'unreadable') {
			open = undefined;
			continue;
		}
		const { cursor, event: readable } = record;
		if (readable.type !== 'text_delta' && readable.type !== 'reasoning_delta') {
			open = undefined;
			continue;
		}
		const kind = readable.type === 'text_delta' ? 'text' : 'reasoning';
		if (open?.kind === kind) open.text += readable.text;
		else {
			open = { kind, text: readable.text, cursor };
			segments.push(open);
		}
	}
	return segments.filter((segment) => segment.text.length > 0);
};
