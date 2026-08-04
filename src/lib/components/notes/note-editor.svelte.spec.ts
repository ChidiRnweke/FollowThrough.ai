import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import NoteEditor from './note-editor.svelte';
import {
	DiagramDeletion,
	deleteDiagramBackward
} from '$lib/components/edra/commands/DiagramDeletion';
import type { DateTime } from '$lib/models/workspace';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId, ProseMirrorDocument } from '$lib/models/notes';
import type { UserId } from '$lib/models/identity';

const MermaidNode = Node.create({
	name: 'mermaid',
	group: 'block',
	atom: true,
	content: 'text*',
	renderHTML: () => ['div', { class: 'diagram-node', 'data-type': 'mermaid' }, 0]
});
const DrawioNode = Node.create({
	name: 'drawio',
	group: 'block',
	atom: true,
	addAttributes: () => ({ diagramId: { default: null } }),
	renderHTML: () => ['div', { class: 'diagram-node', 'data-type': 'drawio' }]
});

const createTestEditor = (content: object) =>
	new Editor({
		element: document.createElement('div'),
		extensions: [StarterKit, MermaidNode, DrawioNode, DiagramDeletion],
		content
	});

const diagram = (type: 'mermaid' | 'drawio') =>
	type === 'mermaid'
		? { type, content: [{ type: 'text', text: 'flowchart LR; A-->B' }] }
		: { type, attrs: { diagramId: '00000000-0000-4000-8000-000000000001' } };

const documentWith = (...content: object[]) => ({ type: 'doc', content });

const runDeletion = (editor: Editor) => {
	let nextState = editor.state;
	const handled = deleteDiagramBackward(editor.state, (transaction) => {
		nextState = editor.state.apply(transaction);
	});
	return { handled, document: nextState.doc.toJSON() };
};

describe('Diagram Backspace command', () => {
	it.each([
		['mermaid', 'mermaid'],
		['mermaid', 'drawio'],
		['drawio', 'mermaid'],
		['drawio', 'drawio']
	] as const)('allows a gap cursor between adjacent %s and %s nodes', async (upper, lower) => {
		const editor = createTestEditor(
			documentWith(diagram(upper), diagram(lower), { type: 'paragraph' })
		);
		const between = editor.state.doc.firstChild!.nodeSize;
		editor.view.dispatch(
			editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, between))
		);
		document.body.append(editor.view.dom);
		editor.view.focus();
		await userEvent.keyboard('{ArrowUp}');
		const selection = editor.state.selection;
		editor.view.dom.remove();
		editor.destroy();

		expect(selection).toBeInstanceOf(GapCursor);
	});

	it.each(['mermaid', 'drawio'] as const)(
		'allows a gap cursor before a leading %s node',
		async (type) => {
			const editor = createTestEditor(documentWith(diagram(type), { type: 'paragraph' }));
			editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
			document.body.append(editor.view.dom);
			editor.view.focus();
			await userEvent.keyboard('{ArrowUp}');
			const selection = editor.state.selection;
			editor.view.dom.remove();
			editor.destroy();

			expect(selection).toBeInstanceOf(GapCursor);
		}
	);

	it.each(['mermaid', 'drawio'] as const)('deletes a selected %s node', (type) => {
		const editor = createTestEditor(documentWith(diagram(type), { type: 'paragraph' }));
		editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

		expect(runDeletion(editor)).toEqual({
			handled: true,
			document: documentWith({ type: 'paragraph' })
		});
	});

	it.each(['mermaid', 'drawio'] as const)(
		'deletes a %s node immediately before an empty following paragraph',
		(type) => {
			const editor = createTestEditor(documentWith(diagram(type), { type: 'paragraph' }));
			const paragraphStart = editor.state.doc.firstChild!.nodeSize + 1;
			editor.view.dispatch(
				editor.state.tr.setSelection(TextSelection.create(editor.state.doc, paragraphStart))
			);

			expect(runDeletion(editor)).toEqual({
				handled: true,
				document: documentWith({ type: 'paragraph' })
			});
		}
	);

	it('deletes the adjacent diagram from a gap cursor', () => {
		const editor = createTestEditor(
			documentWith(diagram('drawio'), { type: 'horizontalRule' }, { type: 'paragraph' })
		);
		const gap = editor.state.doc.firstChild!.nodeSize;
		editor.view.dispatch(
			editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(gap)))
		);

		expect(runDeletion(editor)).toEqual({
			handled: true,
			document: documentWith({ type: 'horizontalRule' }, { type: 'paragraph' })
		});
	});

	it('leaves normal paragraph text to the standard Backspace behavior', () => {
		const content = documentWith({
			type: 'paragraph',
			content: [{ type: 'text', text: 'words' }]
		});
		const editor = createTestEditor(content);
		editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 3)));

		expect(runDeletion(editor)).toEqual({ handled: false, document: content });
	});

	it('leaves non-empty selections untouched', () => {
		const content = documentWith({
			type: 'paragraph',
			content: [{ type: 'text', text: 'words' }]
		});
		const editor = createTestEditor(content);
		editor.view.dispatch(
			editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3))
		);

		expect(runDeletion(editor)).toEqual({ handled: false, document: content });
	});

	it('leaves an unrelated selected block untouched', () => {
		const content = documentWith({ type: 'horizontalRule' }, { type: 'paragraph' });
		const editor = createTestEditor(content);
		editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));

		expect(runDeletion(editor)).toEqual({ handled: false, document: content });
	});

	it('leaves a non-adjacent diagram untouched', () => {
		const content = documentWith(diagram('drawio'), {
			type: 'paragraph',
			content: [{ type: 'text', text: 'between' }]
		});
		const editor = createTestEditor(content);
		editor.commands.focus('end');

		expect(runDeletion(editor)).toEqual({ handled: false, document: content });
	});

	it('moves ArrowUp between adjacent diagrams so Backspace deletes only the upper one', async () => {
		let updates = 0;
		const editor = new Editor({
			element: document.createElement('div'),
			extensions: [StarterKit, MermaidNode, DrawioNode, DiagramDeletion],
			content: documentWith(diagram('mermaid'), diagram('drawio'), { type: 'paragraph' }),
			onUpdate: () => {
				updates += 1;
			}
		});
		const lowerDiagram = editor.state.doc.firstChild!.nodeSize;
		editor.view.dispatch(
			editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, lowerDiagram))
		);
		document.body.append(editor.view.dom);
		editor.view.focus();
		await userEvent.keyboard('{ArrowUp}{Backspace}');
		const result = { document: editor.getJSON(), updates };
		editor.view.dom.remove();
		editor.destroy();

		expect(result).toEqual({
			document: documentWith(diagram('drawio'), { type: 'paragraph' }),
			updates: 1
		});
	});
});

describe('Diagram selection affordances', () => {
	it('renders the focused gap cursor between adjacent diagrams', () => {
		const editor = createTestEditor(
			documentWith(diagram('mermaid'), diagram('drawio'), { type: 'paragraph' })
		);
		document.body.append(editor.view.dom);
		editor.view.dom.classList.add('tiptap');
		editor.view.focus();
		const between = editor.state.doc.firstChild!.nodeSize;
		editor.view.dispatch(
			editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(between)))
		);
		const cursor = editor.view.dom.querySelector<HTMLElement>('.ProseMirror-gapcursor');
		const display = cursor ? getComputedStyle(cursor).display : 'missing';
		editor.view.dom.remove();
		editor.destroy();

		expect(display).toBe('block');
	});

	it.each(['mermaid', 'drawio'] as const)('outlines a selected %s diagram', (type) => {
		const editor = createTestEditor(documentWith(diagram(type), { type: 'paragraph' }));
		document.body.append(editor.view.dom);
		editor.view.dom.classList.add('tiptap');
		editor.view.focus();
		editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
		const selected = editor.view.dom.querySelector<HTMLElement>('.diagram-node');
		const outline = selected
			? {
					style: getComputedStyle(selected).outlineStyle,
					width: getComputedStyle(selected).outlineWidth
				}
			: undefined;
		editor.view.dom.remove();
		editor.destroy();

		expect(outline).toEqual({ style: 'solid', width: '2px' });
	});
});

describe('Note editor keyboard integration', () => {
	it.each(['mermaid', 'drawio'] as const)(
		'removes a %s embed with one real Backspace update',
		async (type) => {
			let updates = 0;
			const initialDocument = documentWith(diagram(type), {
				type: 'paragraph'
			}) as ProseMirrorDocument;
			const screen = render(NoteEditor, {
				noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
				revision: 1,
				document: initialDocument,
				onchange: () => {
					updates += 1;
				},
				onreviseMermaid: async (source) => ({ source }),
				onconvertMermaid: async () => {
					throw new Error('Not used by this test');
				},
				onrejectDrawio: async () => undefined,
				diagrams:
					type === 'drawio'
						? [
								{
									id: '00000000-0000-4000-8000-000000000001' as DiagramId,
									userId: '00000000-0000-4000-8000-000000000003' as UserId,
									noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
									kind: 'drawio',
									title: 'Architecture',
									source: '<mxfile/>',
									renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
									searchableText: 'Architecture',
									createdAt: '1970-01-01T00:00:00.000Z' as DateTime,
									updatedAt: '1970-01-01T00:00:00.000Z' as DateTime
								}
							]
						: []
			});
			screen.component.focusEnd();
			await userEvent.keyboard('{Backspace}');

			expect({ document: screen.component.getDocument(), updates }).toEqual({
				document: documentWith({ type: 'paragraph', attrs: { textAlign: null } }),
				updates: 1
			});
		}
	);
});

describe('Agent-updated block shimmer', () => {
	/** Wait (a few frames) for the decoration to be rendered as a class. */
	const untilShimmered = async (container: HTMLElement): Promise<HTMLElement[]> => {
		for (let frame = 0; frame < 60; frame += 1) {
			const found = [...container.querySelectorAll<HTMLElement>('.note-block-shimmer')];
			if (found.length > 0) return found;
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		return [];
	};

	it('applies the shimmer only to the block whose text changed', async () => {
		const before = documentWith(
			{ type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }
		) as ProseMirrorDocument;
		const after = documentWith(
			{ type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }
		) as ProseMirrorDocument;
		const screen = render(NoteEditor, {
			noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
			revision: 1,
			document: before,
			onreviseMermaid: async (source) => ({ source }),
			onconvertMermaid: async () => {
				throw new Error('Not used by this test');
			},
			onrejectDrawio: async () => undefined
		});
		// Let the editor's view settle into the document (EditorContent mounts it
		// after first render) so the shimmer targets the element the user sees.
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
		);
		screen.component.replaceDocument(after, before);

		const shimmered = (await untilShimmered(screen.container)).map(
			(element) => element.textContent
		);

		expect(shimmered).toEqual(['edited']);
	});

	it('leaves a replace without a previous document untouched', async () => {
		const before = documentWith(
			{ type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }
		) as ProseMirrorDocument;
		const after = documentWith(
			{ type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
			{ type: 'paragraph', content: [{ type: 'text', text: 'edited' }] }
		) as ProseMirrorDocument;
		const screen = render(NoteEditor, {
			noteId: '00000000-0000-4000-8000-000000000002' as NoteId,
			revision: 1,
			document: before,
			onreviseMermaid: async (source) => ({ source }),
			onconvertMermaid: async () => {
				throw new Error('Not used by this test');
			},
			onrejectDrawio: async () => undefined
		});
		screen.component.replaceDocument(after);
		await new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))
		);

		const shimmered = (await untilShimmered(screen.container)).length;

		expect(shimmered).toBe(0);
	});
});
