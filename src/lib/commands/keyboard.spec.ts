import { describe, expect, it } from 'vitest';
import { CommandKeyboardHandler } from './keyboard';

const keyboardEvent = (
	key: string,
	timeStamp: number,
	overrides: Partial<KeyboardEvent> = {}
): KeyboardEvent =>
	({
		key,
		timeStamp,
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		preventDefault() {},
		...overrides
	}) as KeyboardEvent;

const setup = () => {
	const commands: string[] = [];
	const handler = new CommandKeyboardHandler({
		run: (id) => commands.push(id),
		togglePalette: () => commands.push('palette')
	});
	return { commands, handler };
};

describe('Command chord invariants', () => {
	it('runs the second key in a live Mod+K chord', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('n', 200));
		expect(commands).toEqual(['new-note']);
	});

	it('expires a chord without intercepting the later key', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('t', 1701));
		expect(commands).toEqual([]);
	});

	it('Escape cancels a pending chord', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('Escape', 200));
		handler.handle(keyboardEvent('c', 300));
		expect(commands).toEqual([]);
	});

	it('does not intercept ordinary typing without a chord', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('q', 100));
		expect(commands).toEqual([]);
	});

	it('opens the command palette directly', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('p', 100, { ctrlKey: true, shiftKey: true }));
		expect(commands).toEqual(['palette']);
	});

	it('runs the second chord key while the modifier stays held', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('c', 200, { ctrlKey: true }));
		expect(commands).toEqual(['toggle-chat']);
	});

	it('a repeated modifier keydown does not cancel a pending chord', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('Control', 150, { ctrlKey: true }));
		handler.handle(keyboardEvent('n', 200, { ctrlKey: true }));
		expect(commands).toEqual(['new-note']);
	});

	it('matches the second chord key by physical code on dead-key layouts', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('k', 100, { ctrlKey: true }));
		handler.handle(keyboardEvent('Dead', 200, { code: 'KeyT' }));
		expect(commands).toEqual(['quick-todo']);
	});
});

describe('Direct shortcut invariants', () => {
	it('Mod+Shift+I toggles chat focus', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('i', 100, { ctrlKey: true, shiftKey: true }));
		expect(commands).toEqual(['focus-chat']);
	});

	it('Mod+Alt+I no longer maps to a command', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent('i', 100, { ctrlKey: true, altKey: true }));
		expect(commands).toEqual([]);
	});

	it('opens settings via the physical comma key when the layout reports another character', () => {
		const { commands, handler } = setup();
		handler.handle(keyboardEvent(';', 100, { ctrlKey: true, code: 'Comma' }));
		expect(commands).toEqual(['settings']);
	});
});
