import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteVersionDiff from './note-version-diff.svelte';
import type {
	ProseMirrorDocument,
	ProseMirrorHeadingNode,
	ProseMirrorNode,
	ProseMirrorParagraphNode
} from '$lib/models/notes';
import '../../../routes/layout.css';

const para = (text: string): ProseMirrorParagraphNode => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const doc = (...content: ProseMirrorNode[]): ProseMirrorDocument => ({
	type: 'doc',
	content
});

const heading = (level: 1 | 2 | 3 | 4): ProseMirrorHeadingNode => ({
	type: 'heading',
	attrs: { level },
	content: [{ type: 'text', text: `Heading ${level}` }]
});

const typographyDoc = doc(...([1, 2, 3, 4] as const).map(heading), {
	type: 'paragraph',
	content: [
		{ type: 'text', text: 'Body ' },
		{ type: 'text', marks: [{ type: 'bold' }], text: 'bold' }
	]
});

const base = {
	base: doc(para('kept'), para('rewritten')),
	candidate: doc(para('kept'), para('rewritten differently')),
	baseLabel: 'Version 2',
	candidateLabel: 'The note now'
};

describe('NoteVersionDiff', () => {
	it('renders the base pane label', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(await screen.getByText('Version 2').all()).not.toHaveLength(0);
	});

	it('renders the candidate pane label', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(await screen.getByText('The note now').all()).not.toHaveLength(0);
	});

	it('renders the candidate content the reader asked to see', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(await screen.getByText('rewritten differently').all()).not.toHaveLength(0);
	});

	it('adds the diff class only to blocks the model flagged', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(screen.container.querySelectorAll('.diff-block')).toHaveLength(2);
	});

	it('does not wash a block that is identical on both sides', async () => {
		const screen = await render(NoteVersionDiff, base);
		const washed = Array.from(screen.container.querySelectorAll('.diff-block'));
		expect(washed.some((block) => block.textContent?.includes('kept'))).toBe(false);
	});

	it('marks the replaced base block as removed', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(screen.container.querySelectorAll('.diff-removed')).toHaveLength(1);
	});

	it('marks the replacement candidate block as added', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(screen.container.querySelectorAll('.diff-added')).toHaveLength(1);
	});

	it('does not flag any block when the documents are identical', async () => {
		const same = doc(para('one'), para('two'));
		const screen = await render(NoteVersionDiff, {
			...base,
			base: same,
			candidate: same
		});
		expect(screen.container.querySelectorAll('.diff-block')).toHaveLength(0);
	});

	it('renders every pane read-only', async () => {
		const screen = await render(NoteVersionDiff, base);
		const panes = Array.from(screen.container.querySelectorAll('.tiptap .ProseMirror'));
		expect(panes.every((pane) => pane.getAttribute('contenteditable') === 'false')).toBe(true);
	});

	it('summarises the change quietly', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect(await screen.getByText('1 added · 1 removed').all()).not.toHaveLength(0);
	});

	it.each([
		['h1', '32px', '38px', '800'],
		['h2', '24px', '32px', '700'],
		['h3', '20px', '28px', '600'],
		['h4', '18px', '26px', '600'],
		['p', '16px', '24.8px', '400'],
		['strong', '16px', '24.8px', '600']
	])(
		'inherits the authored %s typography in full-size diffs',
		async (selector, fontSize, lineHeight, fontWeight) => {
			const screen = await render(NoteVersionDiff, {
				...base,
				base: typographyDoc,
				candidate: typographyDoc
			});
			const element = screen.container.querySelector<HTMLElement>(`.ProseMirror ${selector}`)!;
			const styles = getComputedStyle(element);

			expect({
				fontSize: styles.fontSize,
				lineHeight: styles.lineHeight,
				fontWeight: styles.fontWeight
			}).toEqual({ fontSize, lineHeight, fontWeight });
		}
	);
});
