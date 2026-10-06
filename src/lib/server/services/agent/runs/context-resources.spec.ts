import { afterEach, describe, expect, it } from 'vitest';
import { AgentContext, type AttachedResource } from './context';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';
import { attachmentViewBuilder } from '$lib/testing/attachments/fixtures/views';
import {
	diagramBuilder,
	runAgentInputBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { DrawioDiagram } from '$lib/models/diagrams';

const formatted = (resource: AttachedResource) =>
	new AgentContext().build(runAgentInputBuilder(), {
		base: {},
		skills: [],
		contextNotes: [],
		contextResources: [resource],
		profileMemory: []
	}).contextResources[0];

const drawio = (): DrawioDiagram => ({
	...diagramBuilder(),
	kind: 'drawio',
	source: '<mxfile><diagram><mxGraphModel/></diagram></mxfile>',
	searchableText: 'Gateway Billing',
	currentRevision: 1,
	publishedRevision: 1
});

afterEach(() => {
	delete process.env.CONTEXT_NOTE_TOKEN_LIMIT;
});

describe('Attached resource context', () => {
	it('inlines a widget as its layout and data', () => {
		const widget = widgetBuilder();
		expect(formatted({ kind: 'widget', widget })).toMatchObject({
			text: {
				inclusion: 'inline',
				text: JSON.stringify({ layout: widget.layout, data: widget.data }, null, 2)
			}
		});
	});

	it('withholds a widget over the token limit', () => {
		process.env.CONTEXT_NOTE_TOKEN_LIMIT = '1';
		expect(formatted({ kind: 'widget', widget: widgetBuilder() })).toMatchObject({
			text: { inclusion: 'too_large' }
		});
	});

	it('inlines a draw.io diagram as its labels, not its XML', () => {
		expect(formatted({ kind: 'diagram', diagram: drawio(), filePath: '/d.drawio' })).toMatchObject({
			text: { inclusion: 'inline', text: 'Gateway Billing' }
		});
	});

	it('inlines a Mermaid diagram as its source', () => {
		expect(
			formatted({ kind: 'diagram', diagram: diagramBuilder(), filePath: '/d.mmd' })
		).toMatchObject({ text: { inclusion: 'inline', text: 'flowchart LR\nA --> B' } });
	});

	it('inlines a file as its extracted text', () => {
		expect(
			formatted({ kind: 'attachment', view: attachmentViewBuilder(), filePath: '/a.txt' })
		).toMatchObject({
			content: {
				kind: 'extracted',
				filePath: '/a.txt',
				text: { inclusion: 'inline', text: 'The launch moves to March.' }
			}
		});
	});

	it('reports a file still being processed instead of an empty body', () => {
		const view = attachmentViewBuilder({
			version: { extractedText: undefined, processingStatus: 'processing' }
		});
		expect(formatted({ kind: 'attachment', view, filePath: '/a.txt' })).toMatchObject({
			content: { kind: 'not_extracted', processingStatus: 'processing' }
		});
	});
});
