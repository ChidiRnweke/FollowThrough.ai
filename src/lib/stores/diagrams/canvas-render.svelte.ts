import { SvelteMap } from 'svelte/reactivity';
import type { ConversationImageInput } from '$lib/models/agent';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';

/**
 * A picture of what the agent last drew, waiting to ride along with the next message.
 *
 * The agent writes draw.io XML and never sees the result, so it iterates blind —
 * one conversation spent five turns on "still broken" while it guessed at stencil
 * names. The canvas renders every draft anyway; this carries that render back so
 * the next turn can look at it.
 *
 * It is a hand-off rather than durable state: taken once, then dropped. History
 * strips images (`ConversationBuffer`), so a render costs only the turn it rides
 * on, which is what makes attaching one to every revision affordable.
 */
const renders = new SvelteMap<ChatSessionKey, ConversationImageInput>();

/** PNG only, because that is all `assertRenderedPng` and the composer accept. */
const IMAGE_NAME = 'diagram-render.png';

export const rememberCanvasRender = (sessionKey: ChatSessionKey, pngDataUrl: string): void => {
	if (!pngDataUrl.startsWith('data:image/png;base64,')) return;
	renders.set(sessionKey, {
		// A uuid because the submission schema validates it as one; a readable
		// `canvas-<key>` was rejected at the boundary and failed the whole message.
		id: crypto.randomUUID(),
		mediaType: 'image/png',
		dataUrl: pngDataUrl,
		name: IMAGE_NAME
	});
};

export const forgetCanvasRender = (sessionKey: ChatSessionKey): void => {
	renders.delete(sessionKey);
};

/**
 * Take the pending render, if one fits.
 *
 * The user's own attachments come first: the composer allows four images and
 * 10 MiB combined, and a diagram the agent can re-render on request must never be
 * what pushes out something the user chose to send.
 */
export const takeCanvasRender = (
	sessionKey: ChatSessionKey,
	attached: readonly ConversationImageInput[],
	limits: { readonly maxImages: number; readonly maxBytes: number }
): ConversationImageInput | undefined => {
	const render = renders.get(sessionKey);
	if (!render || attached.length >= limits.maxImages) return undefined;
	const used = attached.reduce((total, image) => total + base64Bytes(image.dataUrl), 0);
	if (used + base64Bytes(render.dataUrl) > limits.maxBytes) return undefined;
	renders.delete(sessionKey);
	return render;
};

/** Decoded size of a base64 data URL, without decoding it. */
const base64Bytes = (dataUrl: string): number => {
	const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
	const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
	return Math.floor((encoded.length * 3) / 4) - padding;
};
