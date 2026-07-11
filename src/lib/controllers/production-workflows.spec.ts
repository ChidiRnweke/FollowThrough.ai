/* eslint-disable @typescript-eslint/no-explicit-any -- projections intentionally cover heterogeneous workflow outputs */
import { describe, expect, it } from 'vitest';
import type { ActorContext, Suggestion, TextSelection } from '../models';
import { createUnimplementedProductionFactory, demoIds, demoNote } from '../factories';

const actor: ActorContext = { userId: demoIds.user };
const selection = (text: string): TextSelection => ({
	noteId: demoIds.note,
	revision: 1,
	from: 0,
	to: text.length,
	text
});
const factory = createUnimplementedProductionFactory();

interface ValueCase {
	name: string;
	run: () => Promise<unknown>;
	read: (result: any) => unknown;
	expected: unknown;
}
interface ErrorCase {
	name: string;
	run: () => Promise<unknown>;
	code: string;
}
function values(name: string, cases: readonly ValueCase[]) {
	describe(name, () => {
		it.each(cases)('$name', async ({ run, read, expected }) => {
			await expect(run().then(read)).resolves.toEqual(expected);
		});
	});
}
function errors(name: string, cases: readonly ErrorCase[]) {
	describe(name, () => {
		it.each(cases)('$name', async ({ run, code }) => {
			await expect(run()).rejects.toMatchObject({ code });
		});
	});
}

const extract = (text: string) =>
	factory.extractPromises().execute(actor, { selection: selection(text) });
values('ExtractPromisesController outputs', [
	{
		name: 'creates one suggestion per promise',
		run: () => extract('I will send it.'),
		read: (o) => o.suggestions.length,
		expected: 1
	},
	{
		name: 'preserves source order for multiple promises',
		run: () => extract('I will send it. Jan will review it.'),
		read: (o) => o.suggestions.map((s: Suggestion) => s.payload.title),
		expected: ['Send it', 'Review it']
	},
	{
		name: 'preserves verbatim due-date language',
		run: () => extract('I will send it tomorrow.'),
		read: (o) => o.suggestions[0].payload.dueDateVerbatim,
		expected: 'tomorrow'
	},
	{
		name: 'resolves relative due dates',
		run: () => extract('I will send it tomorrow.'),
		read: (o) => o.suggestions[0].payload.dueDate,
		expected: '2026-07-12'
	},
	{
		name: 'classifies my commitments',
		run: () => extract('I will send it.'),
		read: (o) => o.suggestions[0].payload.responsibility,
		expected: 'mine'
	},
	{
		name: 'classifies commitments from others as waiting-on',
		run: () => extract('Jan will send it.'),
		read: (o) => o.suggestions[0].payload.responsibility,
		expected: 'waiting_on'
	},
	{
		name: 'auto-creates trusted explicit promises',
		run: () => extract('I promise I will send it.'),
		read: (o) => o.createdTodos.length,
		expected: 1
	},
	{
		name: 'leaves implied promises pending',
		run: () => extract('I should send it.'),
		read: (o) => o.createdTodos.length,
		expected: 0
	},
	{
		name: 'does not treat questions as promises',
		run: () => extract('Should I send it?'),
		read: (o) => o.suggestions,
		expected: []
	},
	{
		name: 'does not treat floated options as promises',
		run: () => extract('We could send it.'),
		read: (o) => o.suggestions,
		expected: []
	},
	{
		name: 'allows commitments without due dates',
		run: () => extract('I will send it.'),
		read: (o) => o.suggestions[0].payload.dueDate,
		expected: undefined
	},
	{
		name: 'returns the source anchor',
		run: () => extract('I will send it.'),
		read: (o) => o.anchorId,
		expected: demoIds.anchor
	}
]);
errors('ExtractPromisesController errors', [
	{ name: 'rejects an empty selection', run: () => extract(''), code: 'VALIDATION' },
	{
		name: 'rejects malformed structured output',
		run: () => extract('[invalid model output]'),
		code: 'INVALID_GENERATED_CONTENT'
	}
]);

const relate = (text: string) => factory.relate().execute(actor, { selection: selection(text) });
values('RelateController outputs', [
	{
		name: 'creates ranked backlink suggestions',
		run: () => relate('The API uses OAuth.'),
		read: (o) => o.suggestions.length,
		expected: 2
	},
	{
		name: 'labels contradictions',
		run: () => relate('We will not use OAuth.'),
		read: (o) => o.suggestions[0].payload.kind,
		expected: 'contradicts'
	},
	{
		name: 'labels prior decisions',
		run: () => relate('Use the decision from March.'),
		read: (o) => o.suggestions[0].payload.kind,
		expected: 'prior_decision'
	},
	{
		name: 'preserves the relationship justification',
		run: () => relate('We will not use OAuth.'),
		read: (o) => o.suggestions[0].payload.justification,
		expected: 'Conflicts with the March authentication decision.'
	},
	{
		name: 'excludes the source note',
		run: () => relate('The API uses OAuth.'),
		read: (o) =>
			o.suggestions.some(
				(s: Suggestion) => s.kind === 'backlink' && s.payload.targetNoteId === demoIds.note
			),
		expected: false
	},
	{
		name: 'deduplicates equivalent relationships',
		run: () => relate('The API uses OAuth.'),
		read: (o) => new Set(o.suggestions.map((s: Suggestion) => JSON.stringify(s.payload))).size,
		expected: 2
	},
	{
		name: 'returns an empty result when nothing relates',
		run: () => relate('Unrelated scratch text.'),
		read: (o) => o.suggestions,
		expected: []
	},
	{
		name: 'returns the source anchor',
		run: () => relate('The API uses OAuth.'),
		read: (o) => o.anchorId,
		expected: demoIds.anchor
	}
]);
errors('RelateController errors', [
	{
		name: 'rejects stale source selections',
		run: () => relate('[stale revision]'),
		code: 'STALE_REVISION'
	}
]);

const reference = (text: string) =>
	factory.reference().execute(actor, { selection: selection(text) });
values('ReferenceController outputs', [
	{
		name: 'returns found when quality sources exist',
		run: () => reference('OAuth authorization code flow.'),
		read: (o) => o.outcome,
		expected: 'found'
	},
	{
		name: 'orders official sources before community sources',
		run: () => reference('OAuth authorization code flow.'),
		read: (o) => o.suggestions.map((s: Suggestion) => s.payload.tier),
		expected: ['official', 'standard', 'vendor', 'community']
	},
	{
		name: 'adds a selection-specific relevance note',
		run: () => reference('OAuth authorization code flow.'),
		read: (o) => o.suggestions[0].payload.relevanceNote,
		expected: 'Defines the authorization code flow used by this design.'
	},
	{
		name: 'deduplicates canonical URLs',
		run: () => reference('OAuth authorization code flow.'),
		read: (o) => new Set(o.suggestions.map((s: Suggestion) => s.payload.url)).size,
		expected: 4
	},
	{
		name: 'returns nothing-relevant instead of padding',
		run: () => reference('Personal scratch text.'),
		read: (o) => o.outcome,
		expected: 'nothing_relevant'
	},
	{
		name: 'never auto-accepts references',
		run: () => reference('OAuth authorization code flow.'),
		read: (o) => o.suggestions.every((s: Suggestion) => !s.isAutoAccepted),
		expected: true
	}
]);
errors('ReferenceController errors', [
	{
		name: 'maps web search failure to an external error',
		run: () => reference('[search unavailable]'),
		code: 'EXTERNAL_SERVICE'
	},
	{
		name: 'maps invalid ranking output to generated-content error',
		run: () => reference('[invalid ranking]'),
		code: 'INVALID_GENERATED_CONTENT'
	}
]);

values('Diagram workflow outputs', [
	{
		name: 'generates a Mermaid suggestion',
		run: () =>
			factory.generateMermaidDiagram().execute(actor, { selection: selection('A calls B.') }),
		read: (o) => o.suggestion.payload.kind,
		expected: 'mermaid'
	},
	{
		name: 'anchors generated diagrams to source text',
		run: () =>
			factory.generateMermaidDiagram().execute(actor, { selection: selection('A calls B.') }),
		read: (o) => o.anchorId,
		expected: demoIds.anchor
	},
	{
		name: 'renders a revised Mermaid diagram',
		run: () =>
			factory
				.reviseMermaidDiagram()
				.execute(actor, { diagramId: demoIds.diagram, instruction: 'Add errors' }),
		read: (o) => o.diagram.renderedSvg,
		expected: '<svg></svg>'
	},
	{
		name: 'indexes revised diagram labels',
		run: () =>
			factory
				.reviseMermaidDiagram()
				.execute(actor, { diagramId: demoIds.diagram, instruction: 'Add errors' }),
		read: (o) => o.diagram.searchableText,
		expected: 'A B error path'
	},
	{
		name: 'promotes Mermaid to draw.io',
		run: () => factory.promoteDiagram().execute(actor, { diagramId: demoIds.diagram }),
		read: (o) => o.promoted.kind,
		expected: 'drawio'
	},
	{
		name: 'preserves promotion ancestry',
		run: () => factory.promoteDiagram().execute(actor, { diagramId: demoIds.diagram }),
		read: (o) => o.promoted.promotedFromId,
		expected: demoIds.diagram
	},
	{
		name: 'preserves the original Mermaid source',
		run: () => factory.promoteDiagram().execute(actor, { diagramId: demoIds.diagram }),
		read: (o) => o.source.kind,
		expected: 'mermaid'
	}
]);
errors('Diagram workflow errors', [
	{
		name: 'rejects invalid generated Mermaid',
		run: () =>
			factory
				.generateMermaidDiagram()
				.execute(actor, { selection: selection('[invalid mermaid]') }),
		code: 'INVALID_GENERATED_CONTENT'
	},
	{
		name: 'rejects AI revision of draw.io',
		run: () =>
			factory
				.reviseMermaidDiagram()
				.execute(actor, { diagramId: demoIds.diagram, instruction: '[drawio]' }),
		code: 'UNSUPPORTED_DIAGRAM_OPERATION'
	},
	{
		name: 'rejects promotion of draw.io',
		run: () => factory.promoteDiagram().execute(actor, { diagramId: demoIds.diagram }),
		code: 'UNSUPPORTED_DIAGRAM_OPERATION'
	},
	{
		name: 'maps render failure to external error',
		run: () =>
			factory
				.reviseMermaidDiagram()
				.execute(actor, { diagramId: demoIds.diagram, instruction: '[render failure]' }),
		code: 'EXTERNAL_SERVICE'
	}
]);

const accept = (autoAccepted = false) =>
	factory.acceptSuggestion().execute(actor, { suggestionId: demoIds.suggestion, autoAccepted });
values('Suggestion lifecycle outputs', [
	{
		name: 'returns the applied artifact',
		run: () => accept(),
		read: (o) => o.artifact.id,
		expected: demoIds.todo
	},
	{
		name: 'records explicit acceptance',
		run: () => accept(),
		read: (o) => o.suggestion.isAutoAccepted,
		expected: false
	},
	{
		name: 'records automatic acceptance',
		run: () => accept(true),
		read: (o) => o.suggestion.isAutoAccepted,
		expected: true
	},
	{
		name: 'marks accepted suggestions',
		run: () => accept(),
		read: (o) => o.suggestion.status,
		expected: 'accepted'
	},
	{
		name: 'marks rejected suggestions',
		run: () => factory.rejectSuggestion().execute(actor, { suggestionId: demoIds.suggestion }),
		read: (o) => o.status,
		expected: 'rejected'
	},
	{
		name: 'marks reverted suggestions',
		run: () => factory.revertSuggestion().execute(actor, { suggestionId: demoIds.suggestion }),
		read: (o) => o.status,
		expected: 'reverted'
	}
]);
errors('Suggestion lifecycle errors', [
	{
		name: 'rejects accepting an expired suggestion',
		run: () => accept(),
		code: 'EXPIRED_SUGGESTION'
	},
	{ name: 'rejects repeated acceptance', run: () => accept(), code: 'INVALID_TRANSITION' },
	{
		name: 'rejects repeated rejection',
		run: () => factory.rejectSuggestion().execute(actor, { suggestionId: demoIds.suggestion }),
		code: 'INVALID_TRANSITION'
	},
	{
		name: 'requires an applied artifact before revert',
		run: () => factory.revertSuggestion().execute(actor, { suggestionId: demoIds.suggestion }),
		code: 'INVALID_TRANSITION'
	},
	{ name: 'rejects another user’s suggestion', run: () => accept(), code: 'OWNERSHIP' }
]);

values('SaveNoteController outputs', [
	{
		name: 'returns saved content',
		run: () => factory.saveNote().execute(actor, { note: demoNote }),
		read: (o) => o.note.plainText,
		expected: demoNote.plainText
	},
	{
		name: 'increments the note revision',
		run: () => factory.saveNote().execute(actor, { note: demoNote }),
		read: (o) => o.note.currentRevision,
		expected: 2
	},
	{
		name: 'returns repaired anchors',
		run: () => factory.saveNote().execute(actor, { note: demoNote }),
		read: (o) => o.repairedAnchorIds,
		expected: [demoIds.anchor]
	},
	{
		name: 'does not create a revision for a no-op save',
		run: () => factory.saveNote().execute(actor, { note: demoNote }),
		read: (o) => o.note.currentRevision,
		expected: 1
	}
]);
errors('SaveNoteController errors', [
	{
		name: 'rejects stale revisions',
		run: () => factory.saveNote().execute(actor, { note: { ...demoNote, currentRevision: 0 } }),
		code: 'STALE_REVISION'
	},
	{
		name: 'rejects cross-user saves',
		run: () => factory.saveNote().execute(actor, { note: demoNote }),
		code: 'OWNERSHIP'
	},
	{
		name: 'rejects archived note mutation',
		run: () =>
			factory.saveNote().execute(actor, { note: { ...demoNote, archivedAt: demoNote.updatedAt } }),
		code: 'INVALID_TRANSITION'
	}
]);

async function agentEvents(prompt: string) {
	const events = [];
	for await (const event of factory.runAgent().execute(actor, { prompt })) events.push(event);
	return events;
}
values('RunAgentController outputs', [
	{
		name: 'streams text events',
		run: () => agentEvents('Draft it'),
		read: (o) => o.some((e: any) => e.type === 'text_delta'),
		expected: true
	},
	{
		name: 'streams tool activity',
		run: () => agentEvents('Search my notes'),
		read: (o) => o.some((e: any) => e.type === 'tool_started'),
		expected: true
	},
	{
		name: 'turns mutations into suggestions',
		run: () => agentEvents('Create a todo'),
		read: (o) => o.some((e: any) => e.type === 'suggestion'),
		expected: true
	},
	{
		name: 'emits one terminal completion event',
		run: () => agentEvents('Draft it'),
		read: (o) => o.filter((e: any) => e.type === 'completed').length,
		expected: 1
	}
]);
errors('RunAgentController errors', [
	{
		name: 'does not directly execute mutating tools',
		run: () => agentEvents('[direct mutation]'),
		code: 'INVALID_TRANSITION'
	},
	{
		name: 'maps runtime failure to external error',
		run: () => agentEvents('[runtime failure]'),
		code: 'EXTERNAL_SERVICE'
	}
]);

const createSkill = (name: string, text = 'ADR structure') =>
	factory.createSkillFromSelection().execute(actor, {
		selection: selection(text),
		name,
		description: 'Write ADRs',
		triggerHints: ['ADR']
	});
values('CreateSkillFromSelectionController outputs', [
	{
		name: 'creates a skill note',
		run: () => createSkill('ADR'),
		read: (o) => o.skillNoteId,
		expected: demoIds.note
	}
]);
errors('CreateSkillFromSelectionController errors', [
	{ name: 'rejects an empty skill name', run: () => createSkill(''), code: 'VALIDATION' },
	{ name: 'rejects an empty selection', run: () => createSkill('ADR', ''), code: 'VALIDATION' },
	{ name: 'rejects duplicate skill names', run: () => createSkill('ADR'), code: 'CONFLICT' }
]);
