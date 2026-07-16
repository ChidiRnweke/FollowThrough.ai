import { describe, expect, it } from 'vitest';
import { MermaidSubmissionValidator } from './openai-diagram-agent';

describe('Diagram submission safety invariants', () => {
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
});
