import { diagramGenerationFixture } from '$lib/testing/diagrams/fixtures/generation';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import {
	drawioBuilder,
	InMemoryDiagrams,
	mermaidBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';

const setup = (drawio = false) => {
	const generation = diagramGenerationFixture();
	const sourceNotes = new InMemoryNoteContent();
	sourceNotes.notes = [noteBuilder()];
	const diagrams = new InMemoryDiagrams();
	diagrams.diagrams = [drawio ? drawioBuilder() : mermaidBuilder()];
	return {
		diagrams,
		persistence: generation.persistence,
		provider: generation.provider,
		controller: new Diagrams(
			capabilityDependencies<DiagramsDependencies>({
				transactionRunner: new InMemoryTransactionRunner([
					diagrams,
					generation.persistence,
					generation.conversations
				]),
				diagramSourceNotes: sourceNotes,
				diagramFinder: diagrams,
				...generation,
				mermaidRenderer: diagrams,
				textExtractor: diagrams,
				diagramWriter: diagrams,
				diagramIndexer: diagrams
			})
		)
	};
};

describe('Revise Mermaid workflow invariants', () => {
	it.each(['edit', 'archive'] as const)(
		'preserves a peer %s made during generation',
		async (change) => {
			const { controller, diagrams, provider, persistence } = setup();
			const completion = Promise.withResolvers<void>();
			provider.completion = completion.promise;
			const pending = controller
				.reviseMermaid(testActor(), {
					diagramId: mermaidBuilder().id,
					instruction: 'add queue'
				})
				.then(
					() => 'saved',
					() => 'rejected'
				);
			await provider.started.promise;
			const peer =
				change === 'edit'
					? { ...mermaidBuilder(), source: 'flowchart LR\nPeer --> Edit' }
					: { ...mermaidBuilder(), archivedAt: mermaidBuilder().updatedAt };
			diagrams.diagrams = [peer];
			completion.resolve();
			const outcome = await pending;
			expect({
				outcome,
				diagrams: diagrams.diagrams,
				indexed: diagrams.indexedIds,
				runs: persistence.runs.map((run) => run.status)
			}).toEqual({
				outcome: 'rejected',
				diagrams: [peer],
				indexed: [],
				runs: ['failed']
			});
		}
	);

	it('rolls back the revision and fails its run when indexing fails', async () => {
		const { controller, diagrams, persistence } = setup();
		const original = structuredClone(diagrams.diagrams);
		diagrams.failIndex = true;
		await controller
			.reviseMermaid(testActor(), {
				diagramId: mermaidBuilder().id,
				instruction: 'add queue'
			})
			.catch(() => undefined);
		expect({
			diagrams: diagrams.diagrams,
			runs: persistence.runs.map((run) => run.status)
		}).toEqual({
			diagrams: original,
			runs: ['failed']
		});
	});

	it('rejects revision of a promoted draw.io diagram', async () => {
		const { controller } = setup(true);
		await expect(
			controller.reviseMermaid(testActor(), {
				diagramId: drawioBuilder().id,
				instruction: 'change'
			})
		).rejects.toMatchObject({ code: 'UNSUPPORTED_DIAGRAM_OPERATION' });
	});

	it('persists rendered output for a Mermaid revision', async () => {
		const { controller } = setup();
		const result = await controller.reviseMermaid(testActor(), {
			diagramId: mermaidBuilder().id,
			instruction: 'add queue'
		});
		expect(result.diagram.renderedSvg).toContain('<svg>');
	});

	it('indexes the saved Mermaid revision', async () => {
		const { controller, diagrams } = setup();
		await controller.reviseMermaid(testActor(), {
			diagramId: mermaidBuilder().id,
			instruction: 'add queue'
		});
		expect(diagrams.indexedIds).toEqual([mermaidBuilder().id]);
	});

	it('preserves the existing title when the provider submits source without a new title', async () => {
		const { controller } = setup();
		const result = await controller.reviseMermaid(testActor(), {
			diagramId: mermaidBuilder().id,
			instruction: 'add queue'
		});
		expect(result.diagram.title).toBe(mermaidBuilder().title);
	});
});
