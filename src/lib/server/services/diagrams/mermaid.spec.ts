import { describe, expect, it } from 'vitest';
import { MermaidDocumentService } from './mermaid';

describe('Diagram submission safety invariants', () => {
	it('accepts styled Mermaid source in the server validator', async () => {
		await expect(
			new MermaidDocumentService().validate(
				'flowchart LR\n  A[Frontend App] -->|API Calls| B[Backend Server]\n  style A fill:#4A90D9,color:#fff'
			)
		).resolves.toBeUndefined();
	});

	it('rejects Mermaid click handlers', async () => {
		await expect(
			new MermaidDocumentService().validate(
				'flowchart LR\n  A --> B\n  click A "https://example.com"'
			)
		).rejects.toThrow('click handlers');
	});

	it('rejects fenced Mermaid output', async () => {
		await expect(
			new MermaidDocumentService().validate('```mermaid\nflowchart LR\nA --> B\n```')
		).rejects.toThrow('without code fences');
	});

	it('rejects invalid Mermaid syntax', async () => {
		await expect(
			new MermaidDocumentService().validate('sequenceDiagram\n  Alice->>Bob Hello')
		).rejects.toThrow('Invalid Mermaid syntax');
	});

	it('rejects Mermaid HTML labels and names the escaped-newline alternative', async () => {
		await expect(
			new MermaidDocumentService().validate('flowchart LR\n  A["Mini app<br/>(JSON render)"]')
		).rejects.toThrow('Use escaped \\n inside quoted labels');
	});
});

const content = new MermaidDocumentService();

describe('diagram text extraction', () => {
	it('keeps label words and drops markup and syntax', async () => {
		expect(
			await content.extract({ source: 'flowchart LR\n  A[<b>Ingest</b>] --> B{Store?}' })
		).toBe('flowchart LR A Ingest -- B Store');
	});
});

describe('Mermaid rendering', () => {
	it('refuses a source that is not a known Mermaid diagram', async () => {
		await expect(content.render('not a diagram')).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('escapes the source inside the rendered SVG', async () => {
		expect(await content.render('graph TD\n  A --> <B>')).toContain('A --&gt; &lt;B&gt;');
	});
});
