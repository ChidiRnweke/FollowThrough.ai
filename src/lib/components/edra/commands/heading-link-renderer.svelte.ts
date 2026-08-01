import { mount, unmount } from 'svelte';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { HeadingLinkTarget } from './HeadingLinkSuggestion.js';
import HeadingLinkList from '../HeadingLinkList.svelte';

/**
 * Mounts the heading list for the `#` suggestion.
 *
 * Same contract as the note link renderer: positioning is the plugin's job via
 * `props.mount`; this owns the list's state and tears down on exit. The props are
 * a mutated `$state` object because `mount()` returns the component's exports,
 * not a reactive handle — see `createNoteLinkRenderer` for the full story.
 */
export const createHeadingLinkRenderer = (): ReturnType<
	NonNullable<SuggestionOptions<HeadingLinkTarget, HeadingLinkTarget>['render']>
> => {
	let element: HTMLDivElement | undefined;
	let instance: Record<string, unknown> | undefined;
	let unmountFloating: (() => void) | undefined;

	const view = $state<{
		items: readonly HeadingLinkTarget[];
		selected: number;
		onpick: (heading: HeadingLinkTarget) => void;
	}>({ items: [], selected: 0, onpick: () => {} });

	return {
		onStart: (props) => {
			view.items = props.items;
			view.selected = 0;
			view.onpick = (heading) => props.command(heading);
			element = document.createElement('div');
			instance = mount(HeadingLinkList, { target: element, props: view }) as Record<
				string,
				unknown
			>;
			unmountFloating = props.mount?.(element);
		},
		onUpdate: (props) => {
			view.items = props.items;
			// Reset rather than clamp: after a keystroke this is a different list, and keeping
			// an index into the old one selects something the user never looked at.
			view.selected = 0;
			view.onpick = (heading) => props.command(heading);
		},
		onKeyDown: ({ event }) => {
			if (view.items.length === 0) return false;
			if (event.key === 'ArrowDown') {
				view.selected = (view.selected + 1) % view.items.length;
				return true;
			}
			if (event.key === 'ArrowUp') {
				view.selected = (view.selected - 1 + view.items.length) % view.items.length;
				return true;
			}
			if (event.key === 'Enter' || event.key === 'Tab') {
				const heading = view.items[view.selected];
				if (heading) view.onpick(heading);
				return true;
			}
			return false;
		},
		onExit: () => {
			unmountFloating?.();
			unmountFloating = undefined;
			if (instance) void unmount(instance as never);
			instance = undefined;
			element?.remove();
			element = undefined;
			view.items = [];
			view.selected = 0;
		}
	};
};
