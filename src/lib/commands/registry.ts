import { goto } from '$app/navigation';
import type { Component } from 'svelte';
import FilePlus from '@lucide/svelte/icons/file-plus';
import Inbox from '@lucide/svelte/icons/inbox';
import ListTodo from '@lucide/svelte/icons/list-todo';
import MessageSquare from '@lucide/svelte/icons/message-square';
import Settings from '@lucide/svelte/icons/settings';
import Sun from '@lucide/svelte/icons/sun';
import { toggleMode } from 'mode-watcher';
import { palette } from '$lib/stores/palette.svelte';
import { rightPanel } from '$lib/stores/right-panel.svelte';
import { createNote } from '$lib/remote/projects.remote';

export interface AppCommand {
	readonly id: string;
	readonly label: string;
	readonly shortcut?: string;
	readonly icon: Component;
	run(): void | Promise<void>;
}

const focus = (selector: string): void => {
	queueMicrotask(() => document.querySelector<HTMLElement>(selector)?.focus());
};

export const commandRegistry: readonly AppCommand[] = [
	{
		id: 'new-note',
		label: 'Create untitled note',
		shortcut: '⌘K N',
		icon: FilePlus,
		async run() {
			palette.close();
			const result = await createNote({ title: 'Untitled' });
			await goto(`/notes/${result.note.id}`);
			focus('[aria-label="Note title"]');
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
			focus('#quick-todo-input');
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
			await goto('/');
			focus('#quick-capture-input');
		}
	},
	{
		id: 'focus-chat',
		label: 'Toggle chat and focus composer',
		shortcut: '⌘⇧I',
		icon: MessageSquare,
		run() {
			palette.close();
			if (rightPanel.mode === 'chat') {
				rightPanel.close();
				return;
			}
			rightPanel.openChat();
			focus('#chat-composer');
		}
	},
	{
		id: 'todos',
		label: 'Go to todos',
		icon: ListTodo,
		run: () => void goto('/todos')
	},
	{
		id: 'suggestions',
		label: 'Suggestions inbox',
		icon: Inbox,
		run: () => void goto('/suggestions')
	},
	{
		id: 'settings',
		label: 'Open Settings',
		shortcut: '⌘,',
		icon: Settings,
		run: () => void goto('/settings')
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
