import {
	MENTION_PATTERN,
	type MentionDocument,
	type MentionEdit,
	type MentionHistory,
	type ResourceChip
} from '$lib/models/chat';

export const createMentionHistory = (text: string): MentionHistory => ({
	past: [],
	present: { text, references: [] },
	future: []
});

const commit = (history: MentionHistory, present: MentionDocument): MentionHistory => ({
	past: [...history.past, history.present],
	present,
	future: []
});

export function editMentionDocument(document: MentionDocument, edit: MentionEdit): MentionDocument {
	if (edit.from < 0 || edit.to < edit.from || edit.to > document.text.length)
		throw new RangeError('Invalid composer edit');
	const text = document.text.slice(0, edit.from) + edit.text + document.text.slice(edit.to);
	if (text === document.text) return document;
	const delta = edit.text.length - (edit.to - edit.from);
	const references = document.references.flatMap((reference) => {
		if (edit.from < reference.to && edit.to > reference.from) return [];
		if (edit.from === edit.to && edit.from > reference.from && edit.from < reference.to) return [];
		const shifted =
			edit.to <= reference.from
				? { ...reference, from: reference.from + delta, to: reference.to + delta }
				: reference;
		const before = text[shifted.from - 1];
		const after = text[shifted.to];
		if (
			(before !== undefined && /[\p{L}\p{N}_@]/u.test(before)) ||
			(after !== undefined && /[\p{L}\p{N}_]/u.test(after))
		)
			return [];
		return [shifted];
	});
	return { text, references };
}

export const editMentions = (history: MentionHistory, edit: MentionEdit): MentionHistory =>
	commit(history, editMentionDocument(history.present, edit));

export function addMention(history: MentionHistory, chip: ResourceChip): MentionHistory {
	const match = MENTION_PATTERN.exec(history.present.text);
	if (!match) throw new Error('Choose a mention while its query is active');
	const from = match.index + match[1]!.length;
	const token = `@${chip.name}`;
	const edited = editMentionDocument(history.present, {
		from,
		to: history.present.text.length,
		text: `${token} `
	});
	return commit(history, {
		text: edited.text,
		references: [...edited.references, { chip, from, to: from + token.length }]
	});
}

export function removeMention(history: MentionHistory, chip: ResourceChip): MentionHistory {
	let document = history.present;
	const targets = document.references
		.filter((reference) => reference.chip.kind === chip.kind && reference.chip.id === chip.id)
		.sort((a, b) => b.from - a.from);
	for (const target of targets) {
		const to = document.text[target.to] === ' ' ? target.to + 1 : target.to;
		document = editMentionDocument(document, { from: target.from, to, text: '' });
	}
	return commit(history, document);
}

export function restoreMentions(
	history: MentionHistory,
	text: string,
	direction: 'undo' | 'redo'
): { kind: 'restored'; history: MentionHistory } | { kind: 'untracked' } {
	if (direction === 'undo') {
		const index = history.past.findLastIndex((document) => document.text === text);
		if (index < 0) return { kind: 'untracked' };
		return {
			kind: 'restored',
			history: {
				past: history.past.slice(0, index),
				present: history.past[index]!,
				future: [...history.past.slice(index + 1), history.present, ...history.future]
			}
		};
	}
	const index = history.future.findIndex((document) => document.text === text);
	if (index < 0) return { kind: 'untracked' };
	return {
		kind: 'restored',
		history: {
			past: [...history.past, history.present, ...history.future.slice(0, index)],
			present: history.future[index]!,
			future: history.future.slice(index + 1)
		}
	};
}
