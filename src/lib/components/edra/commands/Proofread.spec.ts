// @vitest-environment jsdom

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Proofread, proofreadKey, type ProofreadIssueReport } from './Proofread';

/**
 * A checker that flags one fixed misspelling, and records every block it was
 * asked about — enough to assert both what gets underlined and what never
 * reaches the checker at all.
 */
const stubChecker = () => {
	const seen: string[] = [];
	const check = async (text: string): Promise<readonly ProofreadIssueReport[]> => {
		seen.push(text);
		const issues: ProofreadIssueReport[] = [];
		for (let at = text.indexOf('teh'); at !== -1; at = text.indexOf('teh', at + 1)) {
			issues.push({
				start: at,
				end: at + 3,
				message: 'Did you mean “the”?',
				kind: 'Spelling',
				text: 'teh',
				suggestions: [{ label: 'the', replacement: 'the' }]
			});
		}
		return issues;
	};
	return { check, seen };
};

const createEditor = (content: Record<string, unknown>, check?: ReturnType<typeof stubChecker>) =>
	new Editor({
		element: document.createElement('div'),
		extensions: [
			StarterKit,
			Proofread.configure({
				...(check ? { check: check.check } : {}),
				idleDelayMs: 0,
				enabled: check !== undefined
			})
		],
		content
	});

/** Let the zero-delay timer fire and its awaited checker pass resolve. */
const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 4; turn += 1) await vi.advanceTimersByTimeAsync(0);
};

const decorations = (editor: Editor) =>
	proofreadKey.getState(editor.state)!.decorations.find(0, editor.state.doc.content.size);

const paragraph = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const doc = (...content: Record<string, unknown>[]) => ({ type: 'doc', content });

describe('Proofread', () => {
	beforeEach(() => vi.useFakeTimers());

	it('underlines a misspelling once the writer pauses', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		expect(decorations(editor)).toHaveLength(1);
	});

	it('places the underline over the flagged word and nothing else', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		const [decoration] = decorations(editor);
		expect(editor.state.doc.textBetween(decoration.from, decoration.to)).toBe('teh');
	});

	it('checks without being asked to when a checker is supplied', async () => {
		const editor = new Editor({
			element: document.createElement('div'),
			// No `enabled`: a checker that has to be switched on is one nobody uses.
			extensions: [StarterKit, Proofread.configure({ check: stubChecker().check, idleDelayMs: 0 })],
			content: doc(paragraph('I saw teh dog'))
		});
		await settle();
		expect(decorations(editor)).toHaveLength(1);
	});

	it('draws nothing when no checker is injected', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')));
		await settle();
		expect(decorations(editor)).toHaveLength(0);
	});

	it('replaces exactly the flagged span when a suggestion is applied', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		const [decoration] = decorations(editor);
		editor.commands.applyProofreadSuggestion(decoration.from, decoration.to, 'the');
		expect(editor.state.doc.textContent).toBe('I saw the dog');
	});

	it('never sends a code block to the checker', async () => {
		const checker = stubChecker();
		createEditor(
			doc(paragraph('prose'), { type: 'codeBlock', content: [{ type: 'text', text: 'teh' }] }),
			checker
		);
		await settle();
		expect(checker.seen).toEqual(['prose']);
	});

	it('blanks inline code so its contents are not proofread as prose', async () => {
		const checker = stubChecker();
		createEditor(
			doc({
				type: 'paragraph',
				content: [
					{ type: 'text', text: 'run ' },
					{ type: 'text', text: 'teh', marks: [{ type: 'code' }] },
					{ type: 'text', text: ' now' }
				]
			}),
			checker
		);
		await settle();
		// One space per masked character, so `now` still starts at offset 8.
		expect(checker.seen).toEqual(['run     now']);
	});

	it('keeps an underline on its word after text is inserted before it', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		editor.commands.insertContentAt(1, 'Yesterday ');
		const [decoration] = decorations(editor);
		expect(editor.state.doc.textBetween(decoration.from, decoration.to)).toBe('teh');
	});

	it('turns the browser spellchecker off so the two do not underline the same word', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		expect(editor.view.dom.getAttribute('spellcheck')).toBe('false');
	});

	it('hands the underline back to the browser when proofreading is switched off', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		editor.commands.setProofreadEnabled(false);
		expect(editor.view.dom.getAttribute('spellcheck')).toBe('true');
	});

	it('clears its underlines when proofreading is switched off', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		editor.commands.setProofreadEnabled(false);
		expect(decorations(editor)).toHaveLength(0);
	});

	it('re-checks without an edit when the dictionary changes under it', async () => {
		const checker = stubChecker();
		const editor = createEditor(doc(paragraph('I saw teh dog')), checker);
		await settle();
		editor.commands.refreshProofread();
		await settle();
		expect(checker.seen).toEqual(['I saw teh dog', 'I saw teh dog']);
	});

	it('records the clicked issue so a menu can offer its fixes', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		const [decoration] = decorations(editor);
		editor.view.someProp('handleClick', (handler) =>
			handler(editor.view, decoration.from + 1, new MouseEvent('click'))
		);
		expect(proofreadKey.getState(editor.state)?.selected?.issue.text).toBe('teh');
	});

	it('dismisses the clicked issue once its fix has been applied', async () => {
		const editor = createEditor(doc(paragraph('I saw teh dog')), stubChecker());
		await settle();
		const [decoration] = decorations(editor);
		editor.view.someProp('handleClick', (handler) =>
			handler(editor.view, decoration.from + 1, new MouseEvent('click'))
		);
		editor.commands.applyProofreadSuggestion(decoration.from, decoration.to, 'the');
		expect(proofreadKey.getState(editor.state)?.selected).toBeUndefined();
	});
});
