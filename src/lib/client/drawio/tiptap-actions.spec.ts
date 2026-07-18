import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { DiagramId, SuggestionId } from '$lib/models';
import {
	insertAcceptedDrawioAfterMermaid,
	setPendingDrawioSuggestion,
	type DrawioNodeTransactionPort
} from './tiptap-actions';

const schema = new Schema({
	nodes: {
		doc: { content: 'block+' },
		text: { group: 'inline' },
		mermaid: {
			group: 'block',
			content: 'text*',
			attrs: { pendingDrawioSuggestionId: { default: null } }
		},
		drawio: { group: 'block', atom: true, attrs: { diagramId: { default: null } } }
	}
});

class InMemoryEditorPort implements DrawioNodeTransactionPort {
	state = EditorState.create({
		schema,
		doc: schema.node('doc', undefined, [
			schema.node('mermaid', undefined, [schema.text('A --> B')])
		])
	});
	readonly schema = schema;

	dispatch(transaction: Parameters<DrawioNodeTransactionPort['dispatch']>[0]): void {
		this.state = this.state.apply(transaction);
	}
}

describe('Inline diagram document invariants', () => {
	it('keeps legacy Mermaid nodes backward compatible without a pending id', () => {
		const port = new InMemoryEditorPort();
		expect(port.state.doc.firstChild?.attrs.pendingDrawioSuggestionId).toBeNull();
	});

	it('records the pending conversion suggestion on the Mermaid node', () => {
		const port = new InMemoryEditorPort();
		setPendingDrawioSuggestion(
			port,
			port.state.doc.firstChild!,
			0,
			'10000000-0000-4000-8000-000000000001' as SuggestionId
		);
		expect(port.state.doc.firstChild?.attrs.pendingDrawioSuggestionId).toBe(
			'10000000-0000-4000-8000-000000000001'
		);
	});

	it('acceptance inserts a draw.io reference immediately after unchanged Mermaid source', () => {
		const port = new InMemoryEditorPort();
		insertAcceptedDrawioAfterMermaid(
			port,
			port.state.doc.firstChild!,
			0,
			'60000000-0000-4000-8000-000000000002' as DiagramId
		);
		expect(port.state.doc.toJSON().content?.map((node: { type: string }) => node.type)).toEqual([
			'mermaid',
			'drawio'
		]);
	});

	it('acceptance leaves the Mermaid source unchanged', () => {
		const port = new InMemoryEditorPort();
		insertAcceptedDrawioAfterMermaid(
			port,
			port.state.doc.firstChild!,
			0,
			'60000000-0000-4000-8000-000000000002' as DiagramId
		);
		expect(port.state.doc.firstChild?.textContent).toBe('A --> B');
	});

	it('rejection clears pending state', () => {
		const port = new InMemoryEditorPort();
		setPendingDrawioSuggestion(
			port,
			port.state.doc.firstChild!,
			0,
			'10000000-0000-4000-8000-000000000001' as SuggestionId
		);
		setPendingDrawioSuggestion(port, port.state.doc.firstChild!, 0, null);
		expect(port.state.doc.firstChild?.attrs.pendingDrawioSuggestionId).toBeNull();
	});

	it('rejection inserts no draw.io reference', () => {
		const port = new InMemoryEditorPort();
		setPendingDrawioSuggestion(
			port,
			port.state.doc.firstChild!,
			0,
			'10000000-0000-4000-8000-000000000001' as SuggestionId
		);
		setPendingDrawioSuggestion(port, port.state.doc.firstChild!, 0, null);
		expect(port.state.doc.childCount).toBe(1);
	});
});
