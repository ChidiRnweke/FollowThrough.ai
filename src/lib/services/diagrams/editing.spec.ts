import { expect, it } from 'vitest';
import { diagramEtag } from '$lib/models/diagrams';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { decideDiagramRevision, prepareDiagramWrite } from './editing';

it('preserves publication state when restoring an untitled revision as a draft', () => {
	const current = drawioBuilder({ currentRevision: 4, publishedRevision: 2, title: 'Later title' });
	const result = prepareDiagramWrite(
		current,
		{
			kind: 'restore',
			revision: { source: current.source, searchableText: current.searchableText }
		},
		diagramEtag(current),
		testNow
	);
	expect(result).toEqual({
		kind: 'write',
		write: {
			diagram: { ...current, title: undefined, currentRevision: 5, updatedAt: testNow },
			expectedRevision: 4,
			expectedPublishedRevision: 2
		}
	});
});

it('does not treat an unchanged unpublished draft as an already completed publication', () => {
	expect(
		decideDiagramRevision(
			{ kind: 'publish', baseMatches: false, contentChanged: false },
			{ currentRevision: 4, publishedRevision: 2 }
		)
	).toEqual({ kind: 'conflict' });
});

it('keeps the original preview on a completed publication retry', () => {
	const current = drawioBuilder({
		currentRevision: 4,
		publishedRevision: 4,
		renderedSvg: '<svg>original</svg>'
	});
	expect(
		prepareDiagramWrite(
			current,
			{
				kind: 'publish',
				source: current.source,
				searchableText: current.searchableText,
				renderedSvg: '<svg>different</svg>'
			},
			diagramEtag({ ...current, currentRevision: 3 }),
			testNow
		)
	).toEqual({ kind: 'unchanged', diagram: current });
});
