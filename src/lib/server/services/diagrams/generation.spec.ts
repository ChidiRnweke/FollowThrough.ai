import { expect, it } from 'vitest';
import { DiagramGenerationService } from './generation';
import { InMemoryModelProvider } from '$lib/testing/agent/fakes/in-memory-model-provider';
import { InMemoryDiagramModel } from '$lib/testing/diagrams/fakes/in-memory-diagram-model';
import type { DiagramSubmission, DiagramSubmissionDecision } from '$lib/models/diagrams/generation';

const draft: DiagramSubmission = { kind: 'mermaid', source: 'flowchart LR\nA --> B' };

it('returns a corrected submission after the caller rejects the first draft, and releases the provider', async () => {
	const lease = new InMemoryModelProvider(
		new InMemoryDiagramModel([{ kind: 'mermaid', source: 'invalid' }, draft])
	);
	const generation = new DiagramGenerationService({
		available: true,
		models: () => lease
	}).generate(
		{
			model: 'test/model',
			operation: 'generate',
			prompt: 'Draw a queue',
			instructions: 'Submit Mermaid'
		},
		new AbortController().signal
	);
	const submissions: DiagramSubmission[] = [];
	let decision: DiagramSubmissionDecision | undefined;
	let step = await generation.next();
	while (!step.done) {
		decision = undefined;
		if (step.value.kind === 'submission') {
			const submitted = step.value.draft;
			submissions.push(submitted);
			decision =
				submitted.source === 'invalid'
					? { kind: 'rejected', message: 'Invalid syntax' }
					: { kind: 'accepted', draft: submitted };
		}
		step = await generation.next(decision);
	}
	expect({ result: step.value, submissions, released: lease.closed }).toEqual({
		result: draft,
		submissions: [{ kind: 'mermaid', source: 'invalid' }, draft],
		released: true
	});
});

it('releases the provider when the caller stops the generation early', async () => {
	const lease = new InMemoryModelProvider(new InMemoryDiagramModel([draft]));
	const generation = new DiagramGenerationService({
		available: true,
		models: () => lease
	}).generate(
		{ model: 'test/model', operation: 'generate', prompt: 'Draw a queue', instructions: 'Submit' },
		new AbortController().signal
	);
	await generation.next();
	await generation.return(undefined);
	expect(lease.closed).toBe(true);
});
