import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import StarterKit from '@tiptap/starter-kit';
import ProofreadMenu from './proofread-menu.svelte';
import { Editor } from '$lib/components/edra/commands/CoreEditor';
import {
	Proofread,
	proofreadSelection,
	type ProofreadIssueReport
} from '$lib/components/edra/commands/Proofread';

/**
 * The component half of the click-to-fix menu — the plugin side is covered by
 * `edra/commands/proofread-menu.svelte.spec.ts`. What only the component can
 * answer is dismissal: it mounts itself on <body>, so a click outside the
 * editor never reaches ProseMirror's `handleClick`, and the menu would float
 * over the rest of the app forever.
 */

const check = async (text: string): Promise<readonly ProofreadIssueReport[]> => {
	const at = text.indexOf('teh');
	if (at === -1) return [];
	return [
		{
			start: at,
			end: at + 3,
			message: 'Did you mean “the”?',
			kind: 'Spelling',
			text: 'teh',
			suggestions: [{ label: 'the', replacement: 'the' }]
		}
	];
};

const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async <T>(probe: () => T | undefined): Promise<T> => {
	for (let attempt = 0; attempt < 40; attempt++) {
		const found = probe();
		if (found) return found;
		await settle(20);
	}
	throw new Error('timed out waiting');
};

describe('ProofreadMenu', () => {
	it('dismisses the selection when the reader clicks outside the menu', async () => {
		const element = document.createElement('div');
		document.body.append(element);
		const editor = new Editor({
			element,
			content: '<p>I saw teh dog in the garden this morning.</p>',
			extensions: [StarterKit, Proofread.configure({ check, idleDelayMs: 5, enabled: true })]
		});
		try {
			const underline = await waitFor(
				() => element.querySelector<HTMLElement>('.proofread-issue') ?? undefined
			);
			await userEvent.click(underline);
			const selection = await waitFor(() => proofreadSelection(editor.state));
			await render(ProofreadMenu, {
				editor,
				selection,
				onapply: () => undefined,
				onlearn: () => undefined
			});
			// Give the positioning effect a turn to register the document listener.
			await settle(20);
			// A press landing on neither the menu nor the editor — the sidebar case.
			document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			expect(proofreadSelection(editor.state)).toBeUndefined();
		} finally {
			editor.destroy();
			element.remove();
		}
	});
});
