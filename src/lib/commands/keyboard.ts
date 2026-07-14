import { palette } from '$lib/stores/palette.svelte';
import { runCommand } from './registry';

const CHORD_WINDOW_MS = 1500;

interface KeyboardCommands {
	run(id: string): void;
	togglePalette(): void;
}

export class CommandKeyboardHandler {
	private chordStartedAt: number | undefined;
	private readonly commands: KeyboardCommands;

	constructor(
		commands: KeyboardCommands = {
			run: runCommand,
			togglePalette: () => palette.toggle()
		}
	) {
		this.commands = commands;
	}

	handle(event: KeyboardEvent): void {
		const mod = event.metaKey || event.ctrlKey;
		if (event.key === 'Escape' && this.chordStartedAt !== undefined) {
			event.preventDefault();
			this.chordStartedAt = undefined;
			return;
		}
		if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
			event.preventDefault();
			this.commands.togglePalette();
			return;
		}
		if (mod && event.altKey && event.key.toLowerCase() === 'i') {
			event.preventDefault();
			this.commands.run('focus-chat');
			return;
		}
		if (mod && event.key === ',') {
			event.preventDefault();
			this.commands.run('settings');
			return;
		}
		if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			this.chordStartedAt = event.timeStamp;
			return;
		}
		if (this.chordStartedAt === undefined) return;
		const active = event.timeStamp - this.chordStartedAt <= CHORD_WINDOW_MS;
		this.chordStartedAt = undefined;
		if (!active || mod || event.altKey) return;
		const command = { n: 'new-note', t: 'quick-todo', c: 'toggle-chat', q: 'quick-capture' }[
			event.key.toLowerCase()
		];
		if (!command) return;
		event.preventDefault();
		this.commands.run(command);
	}
}
