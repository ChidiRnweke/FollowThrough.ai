import { palette } from '$lib/stores/palette.svelte';
import { runCommand } from './registry';

const CHORD_WINDOW_MS = 1500;
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Shift', 'Alt', 'AltGraph']);

interface KeyboardCommands {
	run(id: string): void;
	togglePalette(): void;
}

// Match on event.key first, with event.code as a layout-independent fallback
// (dead keys and AltGr layouts can report a key that differs from the legend).
const isLetter = (event: KeyboardEvent, letter: string): boolean =>
	event.key.toLowerCase() === letter || event.code === `Key${letter.toUpperCase()}`;

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
		// A held Ctrl/Cmd auto-repeats its own keydown; letting it through would
		// cancel a pending chord before the second key arrives.
		if (MODIFIER_KEYS.has(event.key)) return;
		const mod = event.metaKey || event.ctrlKey;
		if (event.key === 'Escape' && this.chordStartedAt !== undefined) {
			event.preventDefault();
			this.chordStartedAt = undefined;
			return;
		}
		if (mod && event.shiftKey && isLetter(event, 'p')) {
			event.preventDefault();
			this.commands.togglePalette();
			return;
		}
		if (mod && event.shiftKey && isLetter(event, 'i')) {
			event.preventDefault();
			this.commands.run('focus-chat');
			return;
		}
		if (mod && (event.key === ',' || event.code === 'Comma')) {
			event.preventDefault();
			this.commands.run('settings');
			return;
		}
		if (mod && !event.shiftKey && !event.altKey && isLetter(event, 'k')) {
			event.preventDefault();
			this.chordStartedAt = event.timeStamp;
			return;
		}
		if (this.chordStartedAt === undefined) return;
		const active = event.timeStamp - this.chordStartedAt <= CHORD_WINDOW_MS;
		this.chordStartedAt = undefined;
		// The chord's second key may arrive with Ctrl/Cmd still held (VS Code style);
		// only Alt combos are left to the browser.
		if (!active || event.altKey) return;
		const command = (
			[
				['n', 'new-note'],
				['t', 'quick-todo'],
				['c', 'toggle-chat'],
				['q', 'quick-capture']
			] as const
		).find(([letter]) => isLetter(event, letter))?.[1];
		if (!command) return;
		event.preventDefault();
		this.commands.run(command);
	}
}
