import { describe, expect, it } from 'vitest';
import { DiagramContent } from './content';

const content = new DiagramContent();

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
