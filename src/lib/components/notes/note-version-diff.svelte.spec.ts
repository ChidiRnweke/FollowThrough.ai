import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteVersionDiff from './note-version-diff.svelte';
import type { ProseMirrorDocument } from '$lib/models/notes';

const para = (text: string) => ({
	type: 'paragraph',
	content: [{ type: 'text', text }]
});

const doc = (...content: Record<string, unknown>[]): ProseMirrorDocument => ({
	type: 'doc',
	content
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
});
