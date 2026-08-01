import { describe, expect, it } from 'vitest';
import { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection } from '@tiptap/pm/state';
import { singleMermaidSource } from './diagram-copy';

/**
 * A minimal stand-in for the editor schema: the helper only reads `type.name`
 * and `textContent`, so the real mermaid extension (and its Svelte node view,
 * which a node environment cannot load) is not needed.
 */
const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		paragraph: { group: 'block', content: 'text*' },
		mermaid: { group: 'block', content: 'text*', code: true },
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

describe('Deciding when a copy becomes a diagram image', () => {
	it('takes the source from a selected diagram node', () => {
		const state = stateWith([paragraph('intro'), mermaid('graph TD; A-->B')], (doc) =>
			// Position 7: the paragraph ('intro' + its two token boundaries) sits at 0–6.
			NodeSelection.create(doc, 7)
		);
		expect(singleMermaidSource(state)).toBe('graph TD; A-->B');
	});

	it('takes the source from a select-all over prose and one diagram', () => {
		const state = stateWith(
			[paragraph('before'), mermaid('sequenceDiagram; A->>B: hi'), paragraph('after')],
			(doc) => new AllSelection(doc)
		);
		expect(singleMermaidSource(state)).toBe('sequenceDiagram; A->>B: hi');
	});

	it('leaves a copy with several diagrams to the default behaviour', () => {
		const state = stateWith(
			[mermaid('graph TD; A-->B'), mermaid('graph TD; C-->D')],
			(doc) => new AllSelection(doc)
		);
		expect(singleMermaidSource(state)).toBeUndefined();
	});

	it('leaves a copy without any diagram to the default behaviour', () => {
		const state = stateWith(
			[paragraph('just'), paragraph('prose')],
			(doc) => new AllSelection(doc)
		);
		expect(singleMermaidSource(state)).toBeUndefined();
	});
});
