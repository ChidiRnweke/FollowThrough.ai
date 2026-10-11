import { describe, expect, it } from 'vitest';
import { MermaidSubmissionValidator } from './submission-validation';

describe('Diagram submission safety invariants', () => {
	it('accepts styled Mermaid source in the server validator', async () => {
		await expect(
			new MermaidSubmissionValidator().validate(
				'flowchart LR\n  A[Frontend App] -->|API Calls| B[Backend Server]\n  style A fill:#4A90D9,color:#fff'
			)
		).resolves.toBeUndefined();
	});

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
	});

	it('rejects Mermaid HTML labels and names the escaped-newline alternative', async () => {
		await expect(
			new MermaidSubmissionValidator().validate('flowchart LR\n  A["Mini app<br/>(JSON render)"]')
		).rejects.toThrow('Use escaped \\n inside quoted labels');
	});
});
