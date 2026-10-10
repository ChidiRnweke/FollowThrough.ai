import { describe, expect, it } from 'vitest';
import { Diagrams } from './controller';
import { InMemoryMermaidSyntaxReader } from '$lib/testing/diagrams/fakes/mermaid-syntax';
import { MermaidSubmissionValidator } from '$lib/server/services/diagrams/submission-validation';
import {
	durableDiagramFixture,
	diagramSelection
} from '$lib/testing/diagrams/fixtures/durable-generation';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { DiagramSubmission } from '$lib/models/diagrams/generation';
const draft: DiagramSubmission = { kind: 'mermaid', source: 'flowchart LR\nA --> B' };
const setup = (candidates = [draft]) => {
	const fixture = durableDiagramFixture();
	const provider = fixture.provider;
	provider.submissions = candidates;
	if (!candidates.length) provider.failure = new Error('No diagram candidates remain.');
	const syntax = new InMemoryMermaidSyntaxReader();
	const controller = new Diagrams({
		...fixture.dependencies,
		mermaidValidator: new MermaidSubmissionValidator(syntax),
		generation: {
			...fixture.generation,
			generator: provider
		}
	});
	const run = (signal?: AbortSignal) =>
		controller.generateMermaid(testActor(), { selection: diagramSelection }, signal);
	return { ...fixture, provider, syntax, run };
};
describe('Diagram provider submission through its owning operation', () => {
	it('publishes the accepted draft and releases its provider', async () => {
		const fixture = setup();
		const result = await fixture.run();
		expect({ draft: result.suggestion.payload, closed: fixture.provider.closed }).toMatchObject({
			draft,
			closed: true
		});
	});
	it('allows a correction after the controller rejects a submission', async () => {
		const fixture = setup([{ kind: 'mermaid', source: '```mermaid\ninvalid\n```' }, draft]);
		const result = await fixture.run();
		expect(result.suggestion.payload).toMatchObject(draft);
	});
	it('releases the provider and publishes nothing when cancelled during validation', async () => {
		const fixture = setup();
		const abort = new AbortController();
		const gate = Promise.withResolvers<void>();
		fixture.syntax.gate = gate.promise;
		const execution = fixture.run(abort.signal).then(
			() => ({ kind: 'completed' }),
			(error: Error) => ({ kind: 'failure', message: error.message })
		);
		await fixture.syntax.started.promise;
		abort.abort(new Error('Cancelled during validation'));
		gate.resolve();
		const result = await execution;
		expect({
			result: result.kind,
			closed: fixture.provider.closed,
			suggestions: fixture.suggestions.suggestions
		}).toEqual({ result: 'failure', closed: true, suggestions: [] });
	});
	it('reports a provider failure and releases its lease', async () => {
		const fixture = setup([]);
		const outcome = await fixture.run().then(
			() => 'unexpected success',
			(error: Error) => error.message
		);
		expect({ outcome, closed: fixture.provider.closed }).toEqual({
			outcome: 'No diagram candidates remain.',
			closed: true
		});
	});
	it('cancels one pending validation without closing another generation', async () => {
		const left = setup();
		const right = setup();
		const abort = new AbortController();
		const gate = Promise.withResolvers<void>();
		left.syntax.gate = gate.promise;
		const cancelled = left.run(abort.signal).then(
			() => 'completed',
			() => 'cancelled'
		);
		await left.syntax.started.promise;
		const completed = right.run();
		abort.abort(new Error('Stop left'));
		gate.resolve();
		const [outcome, result] = await Promise.all([cancelled, completed]);
		expect({
			outcome,
			result: result.suggestion.payload,
			closed: [left.provider.closed, right.provider.closed]
		}).toMatchObject({ outcome: 'cancelled', result: draft, closed: [true, true] });
	});
});

it('preserves the existing unknown submission-tool failure at the SDK boundary', async () => {
	const { AgentSdkDiagramProvider } = await import('$lib/server/adapters/diagrams/generation');
	const { InMemoryModelProvider } =
		await import('$lib/testing/agent/fakes/in-memory-model-provider');
	const { InMemoryDiagramModel } =
		await import('$lib/testing/diagrams/fakes/in-memory-diagram-model');
	const fixture = durableDiagramFixture();
	const provider = new InMemoryModelProvider(new InMemoryDiagramModel([draft]));
	const controller = new Diagrams({
		...fixture.dependencies,
		generation: {
			...fixture.generation,
			generator: { create: () => new AgentSdkDiagramProvider(provider) }
		}
	});
	const result = await controller
		.generateMermaid(testActor(), { selection: diagramSelection })
		.then(
			() => ({ kind: 'completed' }),
			(error: Error) => ({ kind: 'failure', message: error.message })
		);
	expect({ result, closed: provider.closed, suggestions: fixture.suggestions.suggestions }).toEqual(
		{
			result: {
				kind: 'failure',
				message:
					'The provider called "submit_mermaid_diagram", which is not a tool this agent offers'
			},
			closed: true,
			suggestions: []
		}
	);
});
