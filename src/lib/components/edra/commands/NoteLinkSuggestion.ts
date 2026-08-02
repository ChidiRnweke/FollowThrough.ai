import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
export interface NoteLinkTarget {
	readonly id: string;
	readonly title: string;
}

/**
 * `@` to link another note.
 *
 * `@` rather than `[[`: it is what authors reach for, having learnt it everywhere else, and
 * nothing in the editor claimed it — the app's other `@` lives in the chat composer, a
 * separate surface. The cost is that `@` occurs in prose (addresses, handles), so the
 * trigger only fires at a word start and gives up silently when nothing matches. Imported
 * `[[Wiki Links]]` are resolved by the importer instead; see `resolveWikiLinks`.
 */

export const noteLinkSuggestionKey = new PluginKey('noteLinkSuggestion');

export interface NoteLinkSuggestionOptions {
	/** Candidate notes for a query. Injected so the editor stays transport-unaware. */
	findNotes?: (query: string) => readonly NoteLinkTarget[];
	/** Mounts the list and returns the handlers the plugin drives. */
	renderer?: () => ReturnType<NonNullable<SuggestionOptions['render']>>;
}

export const NoteLinkSuggestion = Extension.create<NoteLinkSuggestionOptions>({
	name: 'noteLinkSuggestion',

	addOptions() {
		return { findNotes: undefined, renderer: undefined };
	},

	addProseMirrorPlugins() {
		const options = this.options;
		if (!options.findNotes || !options.renderer) return [];
		return [
			Suggestion<NoteLinkTarget, NoteLinkTarget>({
				editor: this.editor,
				pluginKey: noteLinkSuggestionKey,
				char: '@',
				// Only at a word start: mid-word `@` is an address or a handle, not a link.
				allowedPrefixes: [' ', '\n', '(', '[', '"', "'"],
				// A note title has spaces in it, but allowing them here would keep the popup
				// open across a whole sentence. Titles are matched on their words instead.
				allowSpaces: false,
				items: ({ query }) => [...(options.findNotes?.(query) ?? [])],
				render: options.renderer,
				command: ({ editor, range, props }) => {
					// Replace the typed `@query` with the note's title, marked as a link, then
					// leave the caret after it with the mark closed so continued typing is
					// ordinary text.
					editor
						.chain()
						.focus()
						.insertContentAt(range, [
							{
								type: 'text',
								text: props.title,
								marks: [{ type: 'noteLink', attrs: { noteId: props.id } }]
							},
							{ type: 'text', text: ' ' }
						])
						.run();
				}
			})
		];
	}
});

/**
 * Rank note titles for a query.
 *
 * Pure, so the ordering is testable without an editor. A prefix match outranks a
 * word-start match, which outranks a match anywhere — typing "des" should offer "Design
 * review" before "Fundamentals of design".
 */
export const rankNoteLinkTargets = (
	notes: readonly NoteLinkTarget[],
	query: string,
	limit = 8
): readonly NoteLinkTarget[] => {
	const needle = query.trim().toLowerCase();
	if (!needle) return notes.slice(0, limit);

	const scored: { note: NoteLinkTarget; score: number }[] = [];
	for (const note of notes) {
		const title = note.title.toLowerCase();
		const at = title.indexOf(needle);
		if (at === -1) continue;
		const startsWord = at === 0 || /[\s\-_/]/.test(title[at - 1] ?? '');
		scored.push({ note, score: at === 0 ? 0 : startsWord ? 1 : 2 });
	}
	return scored
		.sort((a, b) => a.score - b.score || a.note.title.localeCompare(b.note.title))
		.slice(0, limit)
		.map((entry) => entry.note);
};
