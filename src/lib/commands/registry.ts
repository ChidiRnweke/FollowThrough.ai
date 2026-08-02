import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import {
	FtDocumentPlus as FilePlus,
	FtChat as MessageSquare,
	FtPanelLeft as PanelLeft,
	FtSettings as Settings,
	FtTheme as Sun
} from '$lib/components/icons';
import ListTodo from '@lucide/svelte/icons/list-todo';
import { toggleMode } from 'mode-watcher';
import { palette } from '$lib/stores/shell/palette.svelte';
import { rightPanel } from '$lib/stores/shell/right-panel.svelte';
import { sidebarToggle } from '$lib/stores/shell/sidebar-toggle.svelte';
import { tick } from 'svelte';
import { workbench } from '$lib/stores/workbench/workbench.svelte';
import { projectActions } from '$lib/stores/projects/project-actions.svelte';

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
		label: 'Create untitled note',
		shortcut: '⌘K N',
		icon: FilePlus,
		async run() {
			palette.close();
			const result = await projectActions.createNote('Untitled');
			if (result) await workbench.openTab(result.note.id);
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
