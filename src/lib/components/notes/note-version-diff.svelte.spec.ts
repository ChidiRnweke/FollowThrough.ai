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
	it('folds unchanged stretches out of a focused comparison', async () => {
		const before = Array.from({ length: 8 }, (_, index) => para(`unchanged ${index + 1}`));
		const after = before.map((block, index) => (index === 4 ? para('the edit') : block));
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(...before),
			candidate: doc(...after),
			focus: true
		});
		const text = screen.container.textContent ?? '';
		expect({
			edit: text.includes('the edit'),
			neighbour: text.includes('unchanged 4'),
			distant: text.includes('unchanged 1'),
			folds: screen.container.querySelectorAll('.diff-elided').length
		}).toEqual({ edit: true, neighbour: true, distant: false, folds: 4 });
	});

	it('keeps every block of an unfocused comparison', async () => {
		const before = Array.from({ length: 8 }, (_, index) => para(`unchanged ${index + 1}`));
		const after = before.map((block, index) => (index === 4 ? para('the edit') : block));
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(...before),
			candidate: doc(...after)
		});
		expect(screen.container.querySelectorAll('.diff-elided')).toHaveLength(0);
	});

	it('marks the changed word of a paired title without marking the unchanged body', async () => {
		const unchanged = doc(para('Unchanged body'));
		const screen = await render(NoteVersionDiff, {
			...base,
			base: unchanged,
			candidate: unchanged,
			titles: { base: 'Old title', candidate: 'New title' }
		});
		expect(
			Array.from(screen.container.querySelectorAll('.diff-text'), (mark) => mark.textContent)
		).toEqual(['Old', 'New']);
	});

	it('marks only the words an edit added to a paragraph', async () => {
		const screen = await render(NoteVersionDiff, base);
		expect({
			added: Array.from(screen.container.querySelectorAll('.diff-text-added'), (mark) =>
				mark.textContent?.trim()
			),
			removed: screen.container.querySelectorAll('.diff-text-removed').length,
			blocks: screen.container.querySelectorAll('.diff-block').length,
			summary: (await screen.getByText('1 added · 1 removed').all()).length
		}).toEqual({ added: ['differently'], removed: 0, blocks: 0, summary: 1 });
	});

	it('washes a whole paragraph when a rewrite keeps none of its words', async () => {
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(para('kept'), para('gone entirely')),
			candidate: doc(para('kept'), para('fresh text'))
		});
		expect(
			Array.from(screen.container.querySelectorAll('.diff-block'), (block) => [
				block.classList.contains('diff-removed') ? 'removed' : 'added',
				block.textContent
			])
		).toEqual([
			['removed', 'gone entirely'],
			['added', 'fresh text']
		]);
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
	it('keeps embedded task references passive in a preview without workspace context', async () => {
		const tasks = doc({
			type: 'todoNode',
			attrs: { todoId: '00000000-0000-4000-8005-000000000001' }
		});
		const screen = await render(NoteVersionDiff, { ...base, base: tasks, candidate: tasks });
		expect({
			labels: (await screen.getByText('Linked todo', { exact: true }).all()).length,
			controls: screen.container.querySelectorAll('[role="checkbox"]').length
		}).toEqual({ labels: 2, controls: 0 });
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

const mermaid = (source: string): ProseMirrorNode => ({
	type: 'mermaid',
	content: [{ type: 'text', text: source }]
});
const tableOf = (...rows: string[][]): ProseMirrorNode => ({
	type: 'table',
	content: rows.map((cells) => ({
		type: 'tableRow',
		content: cells.map((text) => ({ type: 'tableCell', content: [para(text)] }))
	}))
});
const sectionHeading = (text: string): ProseMirrorHeadingNode => ({
	type: 'heading',
	attrs: { level: 2 },
	content: [{ type: 'text', text }]
});

/**
 * The editor inserts a spacer paragraph between a heading and a diagram. Painting by raw
 * block index then gave up on the whole side, and an edit beneath a diagram showed no mark.
 */
describe('NoteVersionDiff marks changes the editor normalised around', () => {
	it('still marks an edit in a note where a heading sits on a diagram', async () => {
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(sectionHeading('Flow'), mermaid('graph TD\n  A --> B'), para('Owner is Ada')),
			candidate: doc(sectionHeading('Flow'), mermaid('graph TD\n  A --> B'), para('Owner is Grace'))
		});
		expect(
			Array.from(screen.container.querySelectorAll('.diff-text'), (mark) => mark.textContent)
		).toEqual(['Ada', 'Grace']);
	});

	it('hides the spacer paragraphs the editor inserts around a diagram', async () => {
		const note = doc(sectionHeading('Flow'), mermaid('graph TD\n  A --> B'));
		const screen = await render(NoteVersionDiff, { ...base, base: note, candidate: note });
		const spacers = Array.from(screen.container.querySelectorAll('.diff-spacer'));
		expect({
			present: spacers.length > 0,
			hidden: spacers.every((spacer) => getComputedStyle(spacer).display === 'none')
		}).toEqual({ present: true, hidden: true });
	});

	it('marks only the table cell an edit changed', async () => {
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(tableOf(['Owner', 'Due'], ['Ada', 'Monday'])),
			candidate: doc(tableOf(['Owner', 'Due'], ['Ada', 'Tuesday']))
		});
		expect(
			Array.from(screen.container.querySelectorAll('.diff-cell'), (marked) => marked.textContent)
		).toEqual(['Monday', 'Tuesday']);
	});

	it('offers the source line diff under an edited diagram', async () => {
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(mermaid('graph TD\n  A --> B')),
			candidate: doc(mermaid('graph TD\n  A --> C'))
		});
		const trigger = screen.getByRole('button', { name: 'Source changes' });
		await trigger.click();
		await expect.element(trigger).toHaveAttribute('aria-expanded', 'true');
		await expect.element(screen.getByText('A --> C', { exact: false })).toBeVisible();
	});

	it('overlays the mark on a code block, whose own fill hid a plain wash', async () => {
		const code = (text: string): ProseMirrorNode => ({
			type: 'codeBlock',
			content: [{ type: 'text', text }]
		});
		const screen = await render(NoteVersionDiff, {
			...base,
			base: doc(code('const one = 1;')),
			candidate: doc(para('No code any more'))
		});
		expect(screen.container.querySelectorAll('.diff-removed.diff-overlay')).toHaveLength(1);
	});

	it('says so when a side could not be marked rather than showing it unmarked', async () => {
		const unreadable = doc(para('kept'), {
			type: 'paragraph',
			content: [{ type: 'text', text: '' }]
		});
		const screen = await render(NoteVersionDiff, {
			...base,
			base: unreadable,
			candidate: doc(para('kept'), para('fresh'))
		});
		await expect
			.element(screen.getByText('Changes could not be marked in this view.'))
			.toBeVisible();
	});
});
