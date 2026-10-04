import { afterEach, describe, expect, it } from 'vitest';
import type { ConversationImageInput } from '$lib/models/agent';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { forgetCanvasRender, rememberCanvasRender, takeCanvasRender } from './canvas-render.svelte';

const session = (name: string): ChatSessionKey => name as ChatSessionKey;
const png = (kilobytes: number): string =>
	`data:image/png;base64,${'A'.repeat(Math.ceil((kilobytes * 1024 * 4) / 3))}`;
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
		const expected = png(4);
		rememberCanvasRender(session('a'), expected);
		expect(takeCanvasRender(session('a'))).toMatchObject({
			mediaType: 'image/png',
			dataUrl: expected
		});
	});

	// A hand-off, not durable state: the render belongs to one turn, and history
	// strips images anyway.
	it('is taken only once', () => {
		rememberCanvasRender(session('b'), png(4));
		takeCanvasRender(session('b'));
		expect(takeCanvasRender(session('b'))).toBeUndefined();
	});

	it('belongs to its own conversation', () => {
		rememberCanvasRender(session('c'), png(4));
		expect(takeCanvasRender(session('d'))).toBeUndefined();
	});

	it('is dropped when the canvas asks for it to be', () => {
		rememberCanvasRender(session('e'), png(4));
		forgetCanvasRender(session('e'));
		expect(takeCanvasRender(session('e'))).toBeUndefined();
	});

	it('preserves a render beyond the former byte budget', () => {
		const render = png(11 * 1024);
		rememberCanvasRender(session('g'), render);
		expect(takeCanvasRender(session('g'))?.dataUrl).toBe(render);
	});

	it('still rides along when there is room beside an attachment', () => {
		const render = png(16);
		const userImage = { ...attachment(8), dataUrl: png(8) };
		rememberCanvasRender(session('h'), render);
		expect({
			render: takeCanvasRender(session('h')),
			userImage
		}).toMatchObject({
			render: { mediaType: 'image/png', dataUrl: render, name: 'diagram-render.png' },
			userImage: { dataUrl: png(8), name: 'user.png' }
		});
	});

	// Only PNG reaches the model: it is what the composer and `assertRenderedPng` accept.
	it('refuses anything that is not a PNG data URL', () => {
		rememberCanvasRender(session('i'), 'data:image/svg+xml,%3Csvg%2F%3E');
		expect(takeCanvasRender(session('i'))).toBeUndefined();
	});
});
