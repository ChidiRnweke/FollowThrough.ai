import { describe, expect, it } from 'vitest';
import { MermaidSubmissionValidator } from './submission-validation';
import { NodeMermaidSyntaxReader } from '$lib/server/adapters/diagrams/mermaid-parser';
import { InMemoryMermaidSyntaxReader } from '$lib/testing/diagrams/fakes/mermaid-syntax';

describe('Diagram submission safety invariants', () => {
	it('accepts styled Mermaid source in the server validator', async () => {
		await expect(
			new MermaidSubmissionValidator(new NodeMermaidSyntaxReader()).validate(
				'flowchart LR\n  A[Frontend App] -->|API Calls| B[Backend Server]\n  style A fill:#4A90D9,color:#fff'
			)
		).resolves.toBeUndefined();
	}, 15_000);

	it('rejects Mermaid click handlers', async () => {
		await expect(
			new MermaidSubmissionValidator(new InMemoryMermaidSyntaxReader()).validate(
				'flowchart LR\n  A --> B\n  click A "https://example.com"'
			)
		).rejects.toThrow('click handlers');
	});

	it('rejects fenced Mermaid output', async () => {
		await expect(
			new MermaidSubmissionValidator(new InMemoryMermaidSyntaxReader()).validate(
				'```mermaid\nflowchart LR\nA --> B\n```'
			)
		).rejects.toThrow('without code fences');
	});

	it('rejects invalid Mermaid syntax', async () => {
		await expect(
			new MermaidSubmissionValidator(
				new InMemoryMermaidSyntaxReader(new Error('syntax error'))
			).validate('sequenceDiagram\n  Alice->>Bob Hello')
		).rejects.toThrow('Invalid Mermaid syntax');
	});

	it('rejects Mermaid HTML labels and names the escaped-newline alternative', async () => {
		await expect(
			new MermaidSubmissionValidator(new InMemoryMermaidSyntaxReader()).validate(
				'flowchart LR\n  A["Mini app<br/>(JSON render)"]'
			)
		).rejects.toThrow('Use escaped \\n inside quoted labels');
	});
});
