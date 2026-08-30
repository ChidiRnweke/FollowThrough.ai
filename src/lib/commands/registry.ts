import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import {
	FtDocumentPlus as FilePlus,
	FtChat as MessageSquare,
	FtPanelLeft as PanelLeft,
	FtSearch as SearchIcon,
	FtSettings as Settings,
	FtTheme as Sun
} from '$lib/components/icons';
import ListTodo from '@lucide/svelte/icons/list-todo';
import { toggleMode } from 'mode-watcher';
import { palette } from '$lib/stores/shell/palette.svelte';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
import { sidebarToggle } from '$lib/stores/shell/sidebar-toggle.svelte';
import { tick } from 'svelte';

export interface AppCommand {
	readonly id: string;
	readonly label: string;
	readonly shortcut?: string;
	readonly icon: Component;
	run(): void | Promise<void>;
}

export const commandRegistry: readonly AppCommand[] = [
	{
		id: 'new-note',
		label: 'Create a note',
		shortcut: '⌘K N',
		icon: FilePlus,
		async run() {
			// Sends the user to quick capture rather than creating a note here. A note
			// belongs to a project and the palette knows none, so this used to leave
			// the choice to the server, which answered with whichever project sorted
			// first. Capture names the inbox, and the user sees where it is going.
			palette.close();
			await goto('/today?quickCapture=1');
		}
	},
	{
		id: 'quick-todo',
		label: 'Create todo quickly',
		shortcut: '⌘K T',
		icon: ListTodo,
		async run() {
			palette.close();
			await goto('/todos?view=board&quickTodo=1');
		}
	},
	{
		id: 'toggle-chat',
		label: 'Toggle chat side pane',
		shortcut: '⌘K C',
		icon: MessageSquare,
		run() {
			palette.close();
			rightPanel.toggle('chat');
		}
	},
	{
		id: 'quick-capture',
		label: 'Focus quick capture',
		shortcut: '⌘K Q',
		icon: FilePlus,
		async run() {
			palette.close();
			await goto('/today?quickCapture=1');
		}
	},
	{
		id: 'focus-chat',
		label: 'Toggle chat and focus composer',
		shortcut: '⌘⇧I',
		icon: MessageSquare,
		async run() {
			palette.close();
			if (rightPanel.mode === 'chat') {
				rightPanel.close();
				return;
			}
			rightPanel.openChat();
			await tick();
			rightPanel.requestChatComposerFocus();
		}
	},
	{
		id: 'global-search',
		label: 'Search all notes',
		shortcut: '⌘⇧F',
		icon: SearchIcon,
		async run() {
			palette.close();
			// Open or refocus — the point of the shortcut is typing immediately,
			// so an already-open search gets its input focused, not closed.
			if (rightPanel.mode === 'search') {
				rightPanel.requestSearchInputFocus();
				return;
			}
			rightPanel.openSearch();
			await tick();
			rightPanel.requestSearchInputFocus();
		}
	},
	{
		id: 'todos',
		label: 'Go to todos',
		icon: ListTodo,
		run: () => void goto('/todos')
	},
	{
		id: 'settings',
		label: 'Open Settings',
		shortcut: '⌘,',
		icon: Settings,
		run: () => void goto('/settings')
	},
	{
		id: 'toggle-sidebar',
		label: 'Toggle sidebar',
		shortcut: '⌘\\',
		icon: PanelLeft,
		run: () => {
			palette.close();
			sidebarToggle.toggle();
		}
	},
	{
		id: 'theme',
		label: 'Toggle theme',
		icon: Sun,
		run: () => toggleMode()
	}
];

export const runCommand = (id: string): void => {
	const command = commandRegistry.find((candidate) => candidate.id === id);
	if (command) void command.run();
};
