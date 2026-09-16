import type { ComposerSelection, MentionInput } from '$lib/models/chat';

/** Decode a textarea edit using its actual selection, including repeated identical tokens. */
export function readMentionInput(
	previous: string,
	next: string,
	selection: ComposerSelection,
	inputType: string
): MentionInput {
	let { from, to } = selection;
	const insertedLength = next.length - previous.length + to - from;
	if (insertedLength < 0 && from === to) {
		if (inputType.endsWith('Backward')) from += insertedLength;
		else if (inputType.endsWith('Forward')) to -= insertedLength;
		else return { kind: 'untracked' };
	}
	if (from < 0 || to < from || to > previous.length) return { kind: 'untracked' };
	const suffix = previous.slice(to);
	if (!next.startsWith(previous.slice(0, from)) || !next.endsWith(suffix))
		return { kind: 'untracked' };
	const end = next.length - suffix.length;
	if (end < from) return { kind: 'untracked' };
	return { kind: 'edit', edit: { from, to, text: next.slice(from, end) } };
}
