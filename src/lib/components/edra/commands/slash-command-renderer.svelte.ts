import { mount, unmount } from 'svelte';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { EdraCommand } from './commands.js';
import { commands } from './commands.js';
import { slashCommandGroups, type SlashCommandGroup } from './slash-command-items.js';
import SlashCommandList from '../SlashCommand.svelte';

/**
 * Mounts the block list for the `/` suggestion.
 *
 * Positioning belongs to the plugin — `props.mount` anchors the element to the
 * caret and keeps it there — so this only owns the list's contents and its
 * teardown, the same division `createNoteLinkRenderer` uses.
 *
 * The props object is `$state` and is mutated rather than reassigned: `mount()`
 * returns the component's exports, not a reactive handle, so replacing the return
 * value would update nothing and the list would stay on its first query.
 */
export const createSlashCommandRenderer = (): ReturnType<
	NonNullable<SuggestionOptions<EdraCommand, EdraCommand>['render']>
> => {
	let element: HTMLDivElement | undefined;
	let instance: { handleKeyDown?: (event: KeyboardEvent) => boolean } | undefined;
	let unmountList: (() => void) | undefined;
	let unmountFloating: (() => void) | undefined;

	const view = $state<{
		items: SlashCommandGroup[];
		command: (item: EdraCommand) => void;
	}>({ items: [], command: () => {} });

	return {
		onStart: (props) => {
			view.items = slashCommandGroups(commands, props.query);
			view.command = (item) => props.command(item);
			element = document.createElement('div');
			const mounted = mount(SlashCommandList, { target: element, props: view });
			instance = mounted;
			unmountList = () => void unmount(mounted);
			unmountFloating = props.mount?.(element);
		},
		onUpdate: (props) => {
			view.items = slashCommandGroups(commands, props.query);
			view.command = (item) => props.command(item);
		},
		// The list owns selection and its own key handling, and exports the handler
		// for exactly this: duplicating the arrow-key maths here is how the popup and
		// the highlight drift apart.
		onKeyDown: ({ event }) => {
			if (event.key === 'Escape') return false;
			return instance?.handleKeyDown?.(event) ?? false;
		},
		onExit: () => {
			unmountFloating?.();
			unmountFloating = undefined;
			unmountList?.();
			unmountList = undefined;
			instance = undefined;
			element?.remove();
			element = undefined;
			view.items = [];
		}
	};
};
