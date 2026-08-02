import { mount, unmount } from 'svelte';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { NoteLinkTarget } from './NoteLinkSuggestion.js';
import NoteLinkList from '../NoteLinkList.svelte';

/**
 * Mounts the note list for the `@` suggestion.
 *
 * Positioning is the plugin's job, not ours: `props.mount` appends the element, anchors it
 * to the caret and keeps it there through scrolling and layout shifts via Floating UI. So
 * this only owns the list's state and tears down on exit — hand-rolling anchor maths here
 * is how a popup ends up in the wrong place.
 *
 * The props are a `$state` object that gets mutated, deliberately: `mount()` returns the
 * component's *exports*, not a reactive handle, so assigning to its return value updates
 * nothing. Doing that showed a permanently empty list, because the plugin can call
 * `onStart` before `items()` has resolved and every later `onUpdate` was silently lost.
 */
export const createNoteLinkRenderer = (): ReturnType<
	NonNullable<SuggestionOptions<NoteLinkTarget, NoteLinkTarget>['render']>
> => {
	let element: HTMLDivElement | undefined;
	let instance: Record<string, unknown> | undefined;
	let unmountFloating: (() => void) | undefined;

	const view = $state<{
		items: readonly NoteLinkTarget[];
		selected: number;
		onpick: (note: NoteLinkTarget) => void;
	}>({ items: [], selected: 0, onpick: () => {} });

	return {
		onStart: (props) => {
			view.items = props.items;
			view.selected = 0;
			view.onpick = (note) => props.command(note);
			element = document.createElement('div');
			instance = mount(NoteLinkList, { target: element, props: view }) as Record<string, unknown>;
			unmountFloating = props.mount?.(element);
		},
		onUpdate: (props) => {
			view.items = props.items;
			// Reset rather than clamp: after a keystroke this is a different list, and keeping
			// an index into the old one selects something the user never looked at.
			view.selected = 0;
			view.onpick = (note) => props.command(note);
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
				const note = view.items[view.selected];
				if (note) view.onpick(note);
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
