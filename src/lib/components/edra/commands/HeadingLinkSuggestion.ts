import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

/**
 * `#` to link a heading in the same note.
 *
 * Mirror of the `@` note link, aimed inward: the trigger lists the current
 * document's headings (their ids are assigned by the TableOfContents extension)
 * and inserts an ordinary `link` mark whose href is `#<heading-id>`. Typing `# `
 * still becomes a heading — the suggestion closes on the space before the input
 * rule rewrites the paragraph, so the two gestures never fire together.
 */

export const headingLinkSuggestionKey = new PluginKey('headingLinkSuggestion');
export const headingLinkClickKey = new PluginKey('headingLinkClick');

export interface HeadingLinkTarget {
	/** The heading's document id (`data-toc-id`), assigned by the TableOfContents extension. */
	readonly id: string;
	readonly level: number;
	readonly textContent: string;
}

export interface HeadingLinkSuggestionOptions {
	/** Candidate headings for a query. Injected so the editor stays transport-unaware. */
	findHeadings?: (query: string) => readonly HeadingLinkTarget[];
	/** Mounts the list and returns the handlers the plugin drives. */
	renderer?: () => ReturnType<NonNullable<SuggestionOptions['render']>>;
}

export const HeadingLinkSuggestion = Extension.create<HeadingLinkSuggestionOptions>({
	name: 'headingLinkSuggestion',

	addOptions() {
		return { findHeadings: undefined, renderer: undefined };
	},

	addProseMirrorPlugins() {
		const options = this.options;
		return [
			...(options.findHeadings && options.renderer
				? [
						Suggestion<HeadingLinkTarget, HeadingLinkTarget>({
							editor: this.editor,
							pluginKey: headingLinkSuggestionKey,
							char: '#',
							// Only at a word start: mid-word `#` is a tag or a handle, not a link.
							allowedPrefixes: [' ', '\n', '(', '[', '"', "'"],
							allowSpaces: false,
							items: ({ query }) => [...(options.findHeadings?.(query) ?? [])],
							render: options.renderer,
							command: ({ editor, range, props }) => {
								// Replace the typed `#query` with the heading's text, marked as an
								// anchor link, then leave the caret after it with the mark closed.
								editor
									.chain()
									.focus()
									.insertContentAt(range, [
										{
											type: 'text',
											text: props.textContent,
											marks: [{ type: 'link', attrs: { href: `#${props.id}` } }]
										},
										{ type: 'text', text: ' ' }
									])
									.run();
							}
						})
					]
				: []),
			// The link mark is configured `openOnClick: false`, so an in-note anchor has
			// to supply its own follow behaviour: scroll to the heading rather than
			// navigating (a `#hash` navigation would only reload the shell's URL).
			new Plugin({
				key: headingLinkClickKey,
				props: {
					handleClick: (view, _pos, event) => {
						const target = event.target;
						if (!(target instanceof Element)) return false;
						const href = target.closest('a[href^="#"]')?.getAttribute('href');
						if (!href || href.length < 2) return false;
						const id = href.slice(1);
						const heading =
							view.dom.querySelector(`[data-toc-id="${CSS.escape(id)}"]`) ??
							document.getElementById(id);
						if (!heading) return false;
						event.preventDefault();
						heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
						return true;
					}
				}
			})
		];
	}
});

/**
 * Rank headings for a query.
 *
 * Pure, so the ordering is testable without an editor. Same ordering as note
 * links — a prefix match outranks a word-start match, which outranks a match
 * anywhere — with shallower headings breaking ties, because the top-level
 * section is the likelier target.
 */
export const rankHeadingTargets = (
	headings: readonly HeadingLinkTarget[],
	query: string,
	limit = 8
): readonly HeadingLinkTarget[] => {
	const needle = query.trim().toLowerCase();
	if (!needle) return headings.slice(0, limit);

	const scored: { heading: HeadingLinkTarget; score: number }[] = [];
	for (const heading of headings) {
		const title = heading.textContent.toLowerCase();
		const at = title.indexOf(needle);
		if (at === -1) continue;
		const startsWord = at === 0 || /[\s\-_/]/.test(title[at - 1] ?? '');
		scored.push({ heading, score: at === 0 ? 0 : startsWord ? 1 : 2 });
	}
	return scored
		.sort(
			(a, b) =>
				a.score - b.score ||
				a.heading.level - b.heading.level ||
				a.heading.textContent.localeCompare(b.heading.textContent)
		)
		.slice(0, limit)
		.map((entry) => entry.heading);
};
