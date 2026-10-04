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

/** Take the complete pending render for the next turn. */
export const takeCanvasRender = (
	sessionKey: ChatSessionKey
): ConversationImageInput | undefined => {
	const render = renders.get(sessionKey);
	renders.delete(sessionKey);
	return render;
};
