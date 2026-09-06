import { afterEach, describe, expect, it } from 'vitest';
import type { ConversationImageInput } from '$lib/models/agent';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { forgetCanvasRender, rememberCanvasRender, takeCanvasRender } from './canvas-render.svelte';

const session = (name: string): ChatSessionKey => name as ChatSessionKey;
const png = (kilobytes: number): string =>
	`data:image/png;base64,${'A'.repeat(Math.ceil((kilobytes * 1024 * 4) / 3))}`;
const LIMITS = { maxImages: 4, maxBytes: 10 * 1024 * 1024 };
const attachment = (kilobytes: number): ConversationImageInput => ({
	id: 'user-image',
	mediaType: 'image/png',
	dataUrl: png(kilobytes),
	name: 'user.png'
});

afterEach(() => {
	for (const name of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) {
		forgetCanvasRender(session(name));
	}
});

describe('The picture of what the agent drew', () => {
	it('rides along with the next message', () => {
		rememberCanvasRender(session('a'), png(4));
		expect(takeCanvasRender(session('a'), [], LIMITS)).toMatchObject({ mediaType: 'image/png' });
	});

	// A hand-off, not durable state: the render belongs to one turn, and history
	// strips images anyway.
	it('is taken only once', () => {
		rememberCanvasRender(session('b'), png(4));
		takeCanvasRender(session('b'), [], LIMITS);
		expect(takeCanvasRender(session('b'), [], LIMITS)).toBeUndefined();
	});

	it('belongs to its own conversation', () => {
		rememberCanvasRender(session('c'), png(4));
		expect(takeCanvasRender(session('d'), [], LIMITS)).toBeUndefined();
	});

	it('is dropped when the canvas asks for it to be', () => {
		rememberCanvasRender(session('e'), png(4));
		forgetCanvasRender(session('e'));
		expect(takeCanvasRender(session('e'), [], LIMITS)).toBeUndefined();
	});

	// The agent can always re-render; the user's own attachment cannot be recovered.
	it('yields rather than displacing a full set of user attachments', () => {
		rememberCanvasRender(session('f'), png(4));
		const full = [attachment(1), attachment(1), attachment(1), attachment(1)];
		expect(takeCanvasRender(session('f'), full, LIMITS)).toBeUndefined();
	});

	it('yields rather than pushing the turn over the byte budget', () => {
		rememberCanvasRender(session('g'), png(2048));
		expect(takeCanvasRender(session('g'), [attachment(9000)], LIMITS)).toBeUndefined();
	});

	it('still rides along when there is room beside an attachment', () => {
		rememberCanvasRender(session('h'), png(16));
		expect(takeCanvasRender(session('h'), [attachment(16)], LIMITS)).toBeDefined();
	});

	// Only PNG reaches the model: it is what the composer and `assertRenderedPng` accept.
	it('refuses anything that is not a PNG data URL', () => {
		rememberCanvasRender(session('i'), 'data:image/svg+xml,%3Csvg%2F%3E');
		expect(takeCanvasRender(session('i'), [], LIMITS)).toBeUndefined();
	});
});
