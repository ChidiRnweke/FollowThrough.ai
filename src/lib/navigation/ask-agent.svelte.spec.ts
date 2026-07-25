import { beforeEach, describe, expect, it, vi } from 'vitest';

const goto = vi.fn(async () => undefined);
vi.mock('$app/navigation', () => ({ goto, invalidateAll: vi.fn(async () => undefined) }));

const docked = { fits: true };
vi.mock('$lib/hooks/is-docked-panel.svelte', () => ({
	dockedPanelFits: () => docked.fits
}));

const { askAgent } = await import('./responsive-surfaces');
const { chat } = await import('$lib/stores/chat.svelte');
const { rightPanel } = await import('$lib/stores/right-panel.svelte');
const { consumeChatHandoff } = await import('$lib/stores/chat-handoff');

beforeEach(() => {
	goto.mockClear();
	docked.fits = true;
	chat.staged = undefined;
	rightPanel.close();
	sessionStorage.clear();
});

describe('An invocation point opens the chat where the chat currently lives', () => {
	it('opens the docked panel when there is room beside the content', () => {
		askAgent({ prompt: 'Read my notes and propose the todos they imply' });
		expect(rightPanel.mode).toBe('chat');
	});

	it('stages the prompt for the mounted panel rather than navigating', () => {
		askAgent({ prompt: 'Read my notes and propose the todos they imply' });
		expect(chat.staged?.prompt).toBe('Read my notes and propose the todos they imply');
	});

	it('sends the prompt to the chat page when the panel would cover the content', () => {
		docked.fits = false;
		askAgent({ prompt: 'Connect these notes' });
		expect(goto).toHaveBeenCalledWith('/chats/new');
	});

	it('carries the prompt across that navigation', () => {
		docked.fits = false;
		askAgent({ prompt: 'Connect these notes' });
		expect(consumeChatHandoff()?.prompt).toBe('Connect these notes');
	});
});

describe('An invocation point writes the prompt but never runs it', () => {
	// The sentence is the teaching moment: the user reads what the agent is about
	// to be asked, and nothing happens until they press Enter.
	it('leaves the conversation untouched, so nothing is in flight', () => {
		askAgent({ prompt: 'Review this note and tell me what it commits me to' });
		expect(chat.isStreaming).toBe(false);
	});

	it('keeps the full context alongside the prompt for the eventual send', () => {
		const selection = { noteId: 'note-1', text: 'a promise', from: 0, to: 9 };
		askAgent({ prompt: 'Explain the selected text and what to do with it', selection } as never);
		expect(chat.staged?.selection).toEqual(selection);
	});
});
