import { describe, expect, it } from 'vitest';
import {
	assertRenderedPng,
	diagramRevisionModel,
	DrawioSubmissionCollector,
	MermaidSubmissionValidator
} from './authoring';
import { DrawioXmlValidator } from './drawio';
import { VALID_DRAWIO_XML } from '$lib/testing/fixtures/drawio';

describe('Diagram submission safety invariants', () => {
	it('rejects a rendered payload that is not a PNG', () => {
		expect(() => assertRenderedPng('data:image/png;base64,dGV4dA==')).toThrow('valid PNG');
	});

	it('keeps a native-vision diagram model for rendered revisions', () => {
		expect(diagramRevisionModel('native/model', true, 'png', 'fallback/model')).toBe(
			'native/model'
		);
	});

	it('uses the fallback vision model for a text-only diagram model', () => {
		expect(diagramRevisionModel('text/model', false, 'png', 'fallback/model')).toBe(
			'fallback/model'
		);
	});

	it('keeps source-only repair on the configured model', () => {
		expect(diagramRevisionModel('text/model', false, undefined, 'fallback/model')).toBe(
			'text/model'
		);
	});
	it('accepts styled Mermaid source in the server validator', async () => {
		await expect(
			new MermaidSubmissionValidator().validate(
				'flowchart LR\n  A[Frontend App] -->|API Calls| B[Backend Server]\n  style A fill:#4A90D9,color:#fff'
			)
		).resolves.toBeUndefined();
	}, 15_000);

	it('rejects Mermaid click handlers', async () => {
		await expect(
			new MermaidSubmissionValidator().validate(
				'flowchart LR\n  A --> B\n  click A "https://example.com"'
			)
		).rejects.toThrow('click handlers');
	});

	it('rejects fenced Mermaid output', async () => {
		await expect(
			new MermaidSubmissionValidator().validate('```mermaid\nflowchart LR\nA --> B\n```')
		).rejects.toThrow('without code fences');
	});

	it('rejects invalid Mermaid syntax', async () => {
		await expect(
			new MermaidSubmissionValidator().validate('sequenceDiagram\n  Alice->>Bob Hello')
		).rejects.toThrow('Invalid Mermaid syntax');
	}, 15_000);

	it('rejects Mermaid HTML labels and names the escaped-newline alternative', async () => {
		await expect(
			new MermaidSubmissionValidator().validate('flowchart LR\n  A["Mini app<br/>(JSON render)"]')
		).rejects.toThrow('Use escaped \\n inside quoted labels');
	});
});

describe('Draw.io agent submission invariants', () => {
	it('accepts direct uncompressed draw.io XML', () => {
		const result = new DrawioSubmissionCollector(new DrawioXmlValidator()).submit({
			title: 'Architecture',
			source: VALID_DRAWIO_XML
		});
		expect(result.source).toBe(VALID_DRAWIO_XML);
	});

	it('allows the bounded agent run to correct a rejected submission', () => {
		const submissions = new DrawioSubmissionCollector(new DrawioXmlValidator());
		try {
			submissions.submit({ title: 'Invalid', source: '<mxfile />' });
		} catch {
			// The same collector remains open for the agent's next bounded tool turn.
		}
		const corrected = submissions.submit({ title: 'Corrected', source: VALID_DRAWIO_XML });
		expect(corrected.title).toBe('Corrected');
	});
});
