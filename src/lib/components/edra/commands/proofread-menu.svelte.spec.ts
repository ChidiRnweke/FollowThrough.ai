import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Proofread, proofreadKey, proofreadSelection } from './Proofread';
import type { ProofreadIssueReport } from './Proofread';

/**
 * The click-to-fix menu, driven the way `proofread-menu.svelte` drives it: shown
 * while the plugin holds a selected issue, and anchored with Floating UI to the
 * flagged span rather than to the caret.
 *
 * A real browser is the point. The decoration has to reach the DOM as a class a
 * stylesheet can find, a real pointer event has to land on it, and the menu has
 * to end up over the word — none of which jsdom can answer, and all of which are
 * what "click the underline" means to a reader.
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

const mountEditor = () => {
	const element = document.createElement('div');
	document.body.append(element);
	const editor = new Editor({
		element,
		content: '<p>I saw teh dog in the garden this morning.</p>',
		extensions: [StarterKit, Proofread.configure({ check, idleDelayMs: 5, enabled: true })]
	});

	const menu = document.createElement('div');
	menu.textContent = 'the';
	menu.style.position = 'fixed';
	menu.style.visibility = 'hidden';
	document.body.append(menu);

	// The positioning half of `proofread-menu.svelte`, kept in step with it.
	const anchor = {
		getBoundingClientRect: () => {
			const selection = proofreadSelection(editor.state)!;
			const start = editor.view.coordsAtPos(selection.from);
			const end = editor.view.coordsAtPos(selection.to);
			const left = Math.min(start.left, end.left);
			const top = Math.min(start.top, end.top);
			return new DOMRect(left, top, Math.max(end.right, start.right) - left, end.bottom - top);
		}
	};
	let stop: (() => void) | undefined;
	editor.on('transaction', () => {
		const selected = proofreadSelection(editor.state) !== undefined;
		if (!selected) {
			stop?.();
			stop = undefined;
			menu.style.visibility = 'hidden';
			return;
		}
		if (stop) return;
		menu.style.visibility = 'visible';
		stop = autoUpdate(anchor, menu, () => {
			void computePosition(anchor, menu, {
				strategy: 'fixed',
				placement: 'bottom-start',
				middleware: [offset(6), flip(), shift({ padding: 8 })]
			}).then(({ x, y }) => {
				menu.style.left = `${x}px`;
				menu.style.top = `${y}px`;
			});
		});
	});

	return { editor, element, menu };
};

const waitForUnderline = async (element: HTMLElement): Promise<HTMLElement> => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const underline = element.querySelector<HTMLElement>('.proofread-issue');
		if (underline) return underline;
		await vi.advanceTimersByTimeAsync(20);
	}
	throw new Error('no underline appeared');
};

const waitForMenu = async (menu: HTMLElement): Promise<void> => {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		if (menu.style.visibility === 'visible') return;
		await vi.advanceTimersByTimeAsync(20);
	}
};

describe('the proofreading menu', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	it('renders the underline as a class a stylesheet can target', async () => {
		const { editor, element } = mountEditor();
		const underline = await waitForUnderline(element);
		editor.destroy();
		expect(underline.className).toBe('proofread-issue proofread-issue--spelling');
	});

	it('underlines the misspelled word and nothing around it', async () => {
		const { editor, element } = mountEditor();
		const underline = await waitForUnderline(element);
		editor.destroy();
		expect(underline.textContent).toBe('teh');
	});

	it('opens the menu when a reader clicks the underline', async () => {
		const { editor, element, menu } = mountEditor();
		const underline = await waitForUnderline(element);
		await userEvent.click(underline);
		await waitForMenu(menu);
		editor.destroy();
		expect(menu.style.visibility).toBe('visible');
	});

	it('anchors the menu to the flagged word rather than the caret', async () => {
		const { editor, element, menu } = mountEditor();
		const underline = await waitForUnderline(element);
		const word = underline.getBoundingClientRect();
		await userEvent.click(underline);
		await waitForMenu(menu);
		const placed = menu.getBoundingClientRect();
		editor.destroy();
		// Floating UI places it below and left-aligned; a few pixels of drift is the
		// offset middleware, a hundred would be the caret or the document origin.
		expect(Math.abs(placed.left - word.left)).toBeLessThan(8);
	});

	it('leaves the menu closed until something is actually clicked', async () => {
		const { editor, element, menu } = mountEditor();
		await waitForUnderline(element);
		await vi.advanceTimersByTimeAsync(50);
		editor.destroy();
		expect(menu.style.visibility).toBe('hidden');
	});

	it('does not open the menu for a click on ordinary prose', async () => {
		const { editor, element } = mountEditor();
		await waitForUnderline(element);
		await userEvent.click(element.querySelector('p')!);
		await vi.advanceTimersByTimeAsync(80);
		editor.destroy();
		expect(proofreadKey.getState(editor.state)?.selected).toBeUndefined();
	});

	it('corrects the word when the offered fix is applied', async () => {
		const { editor, element } = mountEditor();
		const underline = await waitForUnderline(element);
		await userEvent.click(underline);
		const selection = proofreadSelection(editor.state)!;
		editor.commands.applyProofreadSuggestion(selection.from, selection.to, 'the');
		const text = editor.state.doc.textContent;
		editor.destroy();
		expect(text).toBe('I saw the dog in the garden this morning.');
	});

	it('closes the menu once the correction has been made', async () => {
		const { editor, element, menu } = mountEditor();
		const underline = await waitForUnderline(element);
		await userEvent.click(underline);
		await waitForMenu(menu);
		const selection = proofreadSelection(editor.state)!;
		editor.commands.applyProofreadSuggestion(selection.from, selection.to, 'the');
		await vi.advanceTimersByTimeAsync(80);
		editor.destroy();
		expect(menu.style.visibility).toBe('hidden');
	});

	it('removes the underline once the word is corrected', async () => {
		const { editor, element } = mountEditor();
		const underline = await waitForUnderline(element);
		await userEvent.click(underline);
		const selection = proofreadSelection(editor.state)!;
		editor.commands.applyProofreadSuggestion(selection.from, selection.to, 'the');
		await vi.advanceTimersByTimeAsync(120);
		const remaining = element.querySelectorAll('.proofread-issue').length;
		editor.destroy();
		expect(remaining).toBe(0);
	});
});
