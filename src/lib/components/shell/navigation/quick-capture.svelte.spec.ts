import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import QuickCapture from './quick-capture.svelte';

const focusedInputId = () => (document.activeElement as HTMLElement | null)?.id;

describe('QuickCapture focus-on-mount', () => {
	it('focuses the capture input when focusOnMount is true', async () => {
		await render(QuickCapture, { focusOnMount: true });
		expect(focusedInputId()).toBe('quick-capture-input');
	});

	it('leaves focus alone when focusOnMount is false', async () => {
		await render(QuickCapture, { focusOnMount: false });
		expect(focusedInputId()).not.toBe('quick-capture-input');
	});

	it('does not focus by default', async () => {
		await render(QuickCapture);
		expect(focusedInputId()).not.toBe('quick-capture-input');
	});
});
