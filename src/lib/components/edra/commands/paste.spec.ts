import { describe, expect, it } from 'vitest';
import { isLiteralPasteShortcut, looksLikeMarkdown } from './paste';

describe('Deciding whether pasted text has structure', () => {
	it.each([
		['a heading', '# Release notes'],
		['a bullet list', '- one\n- two'],
		['a numbered list', '1. first\n2. second'],
		['a blockquote', '> quoted'],
		['a fenced code block', '```ts\nconst a = 1;\n```'],
		['a table row', '| Name | Role |\n| --- | --- |'],
		['a link', 'see [the docs](https://example.com)'],
		['bold text', 'this is **important**'],
		['inline code', 'run `pnpm check`'],
		['several paragraphs', 'First thought.\n\nSecond thought.']
	])('parses %s', (_label, text) => {
		expect(looksLikeMarkdown(text)).toBe(true);
	});

	it.each([
		['a bare sentence', 'Just a sentence I copied.'],
		['a single wrapped line', 'one line\nand its continuation'],
		['empty text', '   '],
		['a bare URL', 'https://example.com/some/path'],
		['a hyphen mid-sentence', 'a well-known problem'],
		['arithmetic', '3 * 4 * 5']
	])('leaves %s alone', (_label, text) => {
		expect(looksLikeMarkdown(text)).toBe(false);
	});
});

describe('Recognising the literal-paste shortcut', () => {
	it('matches ctrl+shift+V', () => {
		expect(
			isLiteralPasteShortcut({ ctrlKey: true, shiftKey: true, key: 'V' } as KeyboardEvent)
		).toBe(true);
	});

	it('matches cmd+shift+v', () => {
		expect(
			isLiteralPasteShortcut({ metaKey: true, shiftKey: true, key: 'v' } as KeyboardEvent)
		).toBe(true);
	});

	it('does not match an ordinary paste', () => {
		expect(
			isLiteralPasteShortcut({ ctrlKey: true, shiftKey: false, key: 'v' } as KeyboardEvent)
		).toBe(false);
	});

	it('does not match another shifted shortcut', () => {
		expect(
			isLiteralPasteShortcut({ ctrlKey: true, shiftKey: true, key: 'p' } as KeyboardEvent)
		).toBe(false);
	});
});
