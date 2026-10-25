import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import {
	InlineSuggestion,
	inlineSuggestionKey,
	type InlineSuggestionResult
} from './InlineSuggestion';

const PARAGRAPH =
	'<p>The migration plan should account for the read-replica cutover window in detail here.</p>';

const offerOf = (text: string): InlineSuggestionResult => ({
	kind: 'offer',
	edit: { kind: 'insert', text }
});

const replaceOf = (replaceBefore: string, text: string): InlineSuggestionResult => ({
	kind: 'offer',
	edit: { kind: 'replace', replaceBefore, replaceAfter: '', text }
});

const TYPO = '<p>The migration plan should acount</p>';
const removedText = (element: HTMLElement) =>
	element.querySelector('.inline-suggestion-removed')?.textContent ?? null;

/**
 * A provider that answers in order, repeating its last answer, and records each
 * request it receives: the external effect the extension is responsible for.
 */
const provider = (...answers: readonly InlineSuggestionResult[]) => {
	const requests: string[] = [];
	return {
		requests,
		fetch: async (input: { readonly trigger: string }): Promise<InlineSuggestionResult> => {
			requests.push(input.trigger);
			return answers[Math.min(requests.length, answers.length) - 1];
		}
	};
};

const mountEditor = (
	fetchSuggestion: (
		input: { readonly trigger: string },
		signal: AbortSignal
	) => Promise<InlineSuggestionResult>,
	content = PARAGRAPH
) => {
	const element = document.createElement('div');
	document.body.append(element);
	const editor = new Editor({
		element,
		content,
		extensions: [StarterKit, InlineSuggestion.configure({ fetchSuggestion, idleDelayMs: 5 })]
	});
	return { editor, element };
};

/** The writer has clicked into the editor; before that a resting caret is the app's doing. */
const touch = (editor: Editor) =>
	editor.view.dom.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

const placeCaret = (editor: Editor, position: number) => {
	editor.view.focus();
	editor.view.dispatch(
		editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position))
	);
};

/** The end of the paragraph, where the trigger policy permits a suggestion. */
const moveCaret = (editor: Editor) => placeCaret(editor, editor.state.doc.content.size - 1);

const typeAtCaret = async (editor: Editor) => {
	moveCaret(editor);
	await userEvent.keyboard(' ');
};

const waitForOffer = async (editor: Editor) => {
	for (let attempt = 0; attempt < 25; attempt++) {
		if (inlineSuggestionKey.getState(editor.state)) return;
		await vi.advanceTimersByTimeAsync(20);
	}
};

const press = (editor: Editor, init: KeyboardEventInit) =>
	editor.view.dom.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
	);

const ghostText = (element: HTMLElement) =>
	element.querySelector('.inline-suggestion')?.textContent ?? null;

describe('InlineSuggestion extension', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// The first-time hint is not under test here; keep the ghost text bare.
		sessionStorage.setItem('inline-suggestion-accepted', '1');
	});
	afterEach(() => vi.useRealTimers());

	it('requests a suggestion after real contenteditable typing', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		moveCaret(editor);
		await userEvent.keyboard(' ');
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('requests when the caret comes to rest at the end of a block', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		touch(editor);
		moveCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('requests when the writer clicks into the editor where the caret already rests', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		// The app parked the caret at the end on open; the editor then lost focus.
		moveCaret(editor);
		editor.view.dom.blur();
		touch(editor);
		editor.view.focus();
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('does not request when the caret rests inside a block', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		touch(editor);
		placeCaret(editor, 10);
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual([]);
	});

	it('does not request for a caret the app placed before the writer touched the editor', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		moveCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual([]);
	});

	it('requests in the empty paragraph Enter opens', async () => {
		const { requests, fetch } = provider(offerOf('Next, the rollback drill.'));
		const { editor } = mountEditor(fetch);
		moveCaret(editor);
		await userEvent.keyboard('{Enter}');
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('renders ghost text after the caret rests', async () => {
		const { editor, element } = mountEditor(provider(offerOf(' to avoid data loss.')).fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBe(' to avoid data loss.');
	});

	it('keeps the ghost text when the writer types its next letter', async () => {
		const { editor, element } = mountEditor(provider(offerOf('to avoid data loss.')).fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('t');
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBe('o avoid data loss.');
	});

	it('does not ask again while the writer types into the offer', async () => {
		const { requests, fetch } = provider(offerOf('to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('to');
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('drops the ghost text on a letter the offer did not predict', async () => {
		const { editor, element } = mountEditor(provider(offerOf('to avoid data loss.')).fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('x');
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBeNull();
	});

	it('asks for the next suggestion once the offer is typed out', async () => {
		const { requests, fetch } = provider(offerOf('to'), offerOf(' avoid data loss.'));
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('to');
		editor.destroy();
		expect(requests).toEqual(['idle', 'idle']);
	});

	it('inserts the suggestion on Tab and clears the ghost text', async () => {
		const { editor, element } = mountEditor(
			provider(offerOf(' to avoid data loss.'), { kind: 'none' }).fetch
		);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Tab' });
		const state = inlineSuggestionKey.getState(editor.state);
		const text = editor.getText();
		const ghost = ghostText(element);
		editor.destroy();
		expect({ ghost, offered: state, includesText: text.includes('avoid data loss') }).toEqual({
			ghost: null,
			offered: null,
			includesText: true
		});
	});

	it('asks for the next suggestion right after Tab accepts one', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Tab' });
		editor.destroy();
		expect(requests).toEqual(['idle', 'idle']);
	});

	it('inserts the suggestion when the ghost text is clicked', async () => {
		const { editor, element } = mountEditor(
			provider(offerOf(' to avoid data loss.'), { kind: 'none' }).fetch
		);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		const ghost = element.querySelector<HTMLElement>('.inline-suggestion');
		if (!ghost) throw new Error('Expected an inline suggestion');
		await userEvent.click(ghost);
		const result = {
			ghost: ghostText(element),
			offered: inlineSuggestionKey.getState(editor.state),
			includesText: editor.getText().includes('avoid data loss'),
			focused: editor.view.hasFocus()
		};
		editor.destroy();
		expect(result).toEqual({ ghost: null, offered: null, includesText: true, focused: true });
	});

	it('dismisses the ghost text on Escape without inserting', async () => {
		const { editor, element } = mountEditor(provider(offerOf(' to avoid data loss.')).fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Escape' });
		const ghost = ghostText(element);
		const inserted = editor.getText().includes('avoid data loss');
		editor.destroy();
		expect({ ghost, inserted }).toEqual({ ghost: null, inserted: false });
	});

	it('does not immediately offer again after Escape', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Escape' });
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('asks at once on Alt+\\ even after Escape dismissed the offer', async () => {
		const { requests, fetch } = provider(offerOf(' to avoid data loss.'));
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Escape' });
		press(editor, { key: '\\', code: 'Backslash', keyCode: 220, altKey: true });
		editor.destroy();
		expect(requests).toEqual(['idle', 'explicit']);
	});

	it('stays silent on Alt+\\ inside a code block', async () => {
		const { requests, fetch } = provider(offerOf(' // and the rollback'));
		const { editor } = mountEditor(
			fetch,
			'<pre><code>const cutover = plan.readReplicaWindow();</code></pre>'
		);
		touch(editor);
		moveCaret(editor);
		press(editor, { key: '\\', code: 'Backslash', keyCode: 220, altKey: true });
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual([]);
	});

	it('retries once after the server asks it to wait', async () => {
		const { requests, fetch } = provider(
			{ kind: 'retry', afterMs: 20 },
			offerOf(' to avoid data loss.')
		);
		const { editor, element } = mountEditor(fetch);
		await typeAtCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		const ghost = ghostText(element);
		editor.destroy();
		expect({ requests, ghost }).toEqual({
			requests: ['idle', 'idle'],
			ghost: ' to avoid data loss.'
		});
	});

	it('does not keep retrying at one spot', async () => {
		const { requests, fetch } = provider({ kind: 'retry', afterMs: 20 });
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await vi.advanceTimersByTimeAsync(300);
		editor.destroy();
		expect(requests).toEqual(['idle', 'idle']);
	});

	it('drops a pending retry when the caret moves away', async () => {
		const { requests, fetch } = provider(
			{ kind: 'retry', afterMs: 20 },
			offerOf(' to avoid data loss.')
		);
		const { editor } = mountEditor(fetch);
		await typeAtCaret(editor);
		await vi.advanceTimersByTimeAsync(10);
		placeCaret(editor, 10);
		await vi.advanceTimersByTimeAsync(100);
		editor.destroy();
		expect(requests).toEqual(['idle']);
	});

	it('announces when a suggestion could not be fetched', async () => {
		const { editor, element } = mountEditor(
			provider({ kind: 'failure', message: 'Writing suggestion failed with status 502.' }).fetch
		);
		await typeAtCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		const status = element.querySelector('.sr-only')?.textContent;
		editor.destroy();
		expect(status).toBe('Writing suggestion unavailable.');
	});

	it('offers nothing when the answer is none', async () => {
		const { editor, element } = mountEditor(provider({ kind: 'none' }).fetch);
		await typeAtCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBeNull();
	});

	it('strikes through the characters a replacement would swap and offers the new text', async () => {
		const { editor, element } = mountEditor(
			provider(replaceOf('acount', 'account for the cutover.')).fetch,
			TYPO
		);
		touch(editor);
		moveCaret(editor);
		await waitForOffer(editor);
		const shown = { removed: removedText(element), ghost: ghostText(element) };
		editor.destroy();
		expect(shown).toEqual({ removed: 'acount', ghost: 'account for the cutover.' });
	});

	it('applies the whole replacement on Tab', async () => {
		const { editor } = mountEditor(
			provider(replaceOf('acount', 'account for the cutover.'), { kind: 'none' }).fetch,
			TYPO
		);
		touch(editor);
		moveCaret(editor);
		await waitForOffer(editor);
		press(editor, { key: 'Tab' });
		const text = editor.getText();
		editor.destroy();
		expect(text).toBe('The migration plan should account for the cutover.');
	});

	it('offers nothing when the anchor is not the text before the caret', async () => {
		const { editor, element } = mountEditor(provider(replaceOf('account', 'accounts')).fetch, TYPO);
		touch(editor);
		moveCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBeNull();
	});

	it('offers nothing when the anchor would reach into the block before', async () => {
		const { editor, element } = mountEditor(
			provider(replaceOf('migration plan should acount', 'account')).fetch,
			'<p>The migration</p><p>plan should acount</p>'
		);
		touch(editor);
		moveCaret(editor);
		await vi.advanceTimersByTimeAsync(100);
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBeNull();
	});

	it('drops a replacement on the next keystroke rather than typing into it', async () => {
		const { editor, element } = mountEditor(
			provider(replaceOf('acount', 'account for')).fetch,
			TYPO
		);
		touch(editor);
		moveCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('a');
		const ghost = ghostText(element);
		editor.destroy();
		expect(ghost).toBeNull();
	});

	it('brings the ghost text back after Backspace without asking again', async () => {
		const { requests, fetch } = provider(offerOf('to avoid data loss.'));
		const { editor, element } = mountEditor(fetch);
		await typeAtCaret(editor);
		await waitForOffer(editor);
		await userEvent.keyboard('t');
		await userEvent.keyboard('{Backspace}');
		await waitForOffer(editor);
		const ghost = ghostText(element);
		editor.destroy();
		expect({ requests, ghost }).toEqual({ requests: ['idle'], ghost: 'to avoid data loss.' });
	});
});
