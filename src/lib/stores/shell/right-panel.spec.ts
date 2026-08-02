import { describe, expect, it } from 'vitest';
import { RightPanelStore } from './right-panel.svelte';

describe('RightPanelStore composer focus ownership', () => {
	it('delivers a pending focus request when the composer registers', () => {
		const panel = new RightPanelStore();
		let focused = false;
		panel.requestChatComposerFocus();

		panel.registerChatComposerFocus(() => (focused = true));

		expect(focused).toBe(true);
	});

	it('focuses the registered composer immediately', () => {
		const panel = new RightPanelStore();
		let focused = false;
		panel.registerChatComposerFocus(() => (focused = true));

		panel.requestChatComposerFocus();

		expect(focused).toBe(true);
	});

	it('does not call a composer after its registration is released', () => {
		const panel = new RightPanelStore();
		let focusCount = 0;
		const release = panel.registerChatComposerFocus(() => (focusCount += 1));
		release();

		panel.requestChatComposerFocus();

		expect(focusCount).toBe(0);
	});
});
