import { describe, expect, it } from 'vitest';
import { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection } from '@tiptap/pm/state';
import { hasMedia, selectionMedia } from './diagram-copy';

/**
 * A minimal stand-in for the editor schema: the helper only reads `type.name`,
 * `textContent` and the image `src`, so the real mermaid and image extensions
 * (and the Svelte node views a node environment cannot load) are not needed.
 */
const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*' },
		mermaid: { group: 'block', content: 'text*', code: true },
		image: { group: 'block', atom: true, attrs: { src: { default: null } } },
		text: {}
	}
});

const stateWith = (
	content: Record<string, unknown>[],
	selection?: (doc: ProseMirrorNode) => EditorState['selection']
): EditorState => {
	const doc = ProseMirrorNode.fromJSON(schema, { type: 'doc', content });
	return EditorState.create({ schema, doc, ...(selection ? { selection: selection(doc) } : {}) });
};

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const mermaid = (source: string) => ({
	type: 'mermaid',
	content: [{ type: 'text', text: source }]
});
const image = (src: string) => ({ type: 'image', attrs: { src } });

describe('Deciding what a copied selection carries', () => {
	it('reports a selected diagram as the only thing copied', () => {
		const state = stateWith([paragraph('intro'), mermaid('graph TD; A-->B')], (doc) =>
			// Position 7: the paragraph ('intro' + its two token boundaries) sits at 0–6.
			NodeSelection.create(doc, 7)
		);
		expect(selectionMedia(state).lone).toEqual({ kind: 'mermaid', source: 'graph TD; A-->B' });
	});

	it('reports a selected image as the only thing copied', () => {
		const state = stateWith([paragraph('intro'), image('/api/attachments/a1/content')], (doc) =>
			NodeSelection.create(doc, 7)
		);
		expect(selectionMedia(state).lone).toEqual({
			kind: 'image',
			src: '/api/attachments/a1/content'
		});
	});

	it('does not reduce a select-all over prose and one diagram to that diagram', () => {
		const state = stateWith(
			[paragraph('before'), mermaid('sequenceDiagram; A->>B: hi'), paragraph('after')],
			(doc) => new AllSelection(doc)
		);
		expect(selectionMedia(state).lone).toBeUndefined();
	});

	it('collects every diagram in a select-all', () => {
		const state = stateWith(
			[mermaid('graph TD; A-->B'), mermaid('graph TD; C-->D')],
			(doc) => new AllSelection(doc)
		);
		expect(selectionMedia(state).mermaidSources).toEqual(['graph TD; A-->B', 'graph TD; C-->D']);
	});

	it('collects every image in a select-all', () => {
		const state = stateWith(
			[paragraph('before'), image('/api/attachments/a1/content'), image('/two.png')],
			(doc) => new AllSelection(doc)
		);
		expect(selectionMedia(state).imageSrcs).toEqual(['/api/attachments/a1/content', '/two.png']);
	});

	it('leaves a copy without any picture to the default behaviour', () => {
		const state = stateWith(
			[paragraph('just'), paragraph('prose')],
			(doc) => new AllSelection(doc)
		);
		expect(hasMedia(selectionMedia(state))).toBe(false);
	});

	it('takes a mixed selection down the picture-inlining path', () => {
		const state = stateWith(
			[paragraph('before'), mermaid('graph TD; A-->B'), image('/a.png')],
			(doc) => new AllSelection(doc)
		);
		expect(hasMedia(selectionMedia(state))).toBe(true);
	});

	it('keeps the diagram source out of the prose it is weighed against', () => {
		const state = stateWith([mermaid('graph TD; A-->B')], (doc) => new AllSelection(doc));
		expect(selectionMedia(state).lone).toEqual({ kind: 'mermaid', source: 'graph TD; A-->B' });
	});
});
