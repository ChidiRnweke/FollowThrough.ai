import { expect, it } from 'vitest';
import { AgentSdkDiagramProvider } from './generation';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryDiagramModel } from '$lib/testing/diagrams/fakes/in-memory-diagram-model';
import type { DiagramSubmission } from '$lib/models/diagrams/generation';
const draft: DiagramSubmission = { kind: 'mermaid', source: 'flowchart LR\nA --> B' };
it('returns a corrected submission after the owner rejects the first provider draft', async () => {
	const lease = new InMemoryModelProvider(
		new InMemoryDiagramModel([{ kind: 'mermaid', source: 'invalid' }, draft])
	);
	const provider = new AgentSdkDiagramProvider(lease);
	const submissions: DiagramSubmission[] = [];
	try {
		const result = await provider.run(
			{
				model: 'test/model',
				operation: 'generate',
				prompt: 'Draw a queue',
				instructions: 'Submit Mermaid'
			},
			new AbortController().signal,
			{
				provider: () => {},
				submit: async (value) => {
					submissions.push(value);
					return value.source === 'invalid'
						? { kind: 'rejected', message: 'Invalid syntax' }
						: { kind: 'accepted', draft: value };
				}
			}
		);
		expect({ result, submissions }).toEqual({
			result: draft,
			submissions: [{ kind: 'mermaid', source: 'invalid' }, draft]
		});
	} finally {
		await provider.close();
	}
});
