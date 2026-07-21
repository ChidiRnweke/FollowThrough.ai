import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import type { InlineSuggestionRequest, NoteId, ProjectId } from '$lib/models';
import { seedWorkspace } from '../lab/workspace';
import { inlineSuggestionWorkspace } from '../fixtures/workspaces/inline-suggestion';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Inline suggestion cases. These bypass the agent loop entirely and drive the
 * inline-suggestions controller directly, because that is the runtime the
 * feature actually uses: direct retrieval followed by one toolless completion.
 *
 * Two properties matter and are tested separately:
 *  - shape: the completion is a clean continuation, checkable in code.
 *  - grounding: project RAG surfaces a fact the passage never states.
 */

const requestFor = (
	projectId: ProjectId,
	noteId: NoteId,
	prefix: string
): InlineSuggestionRequest => ({
	requestId: crypto.randomUUID(),
	projectId,
	noteId,
	revision: 1,
	blockType: 'paragraph',
	headingPath: ['Migration plan'],
	currentSection: prefix,
	prefix,
	suffix: '',
	heading: 'Migration plan'
});

export const inlineSuggestionCases: readonly EvalCase[] = [
	{
		id: 'inline-suggestion-shape',
		name: 'produces a clean continuation with no preamble or echo',
		splits: [ARCHETYPES.inlineSuggestionShape],
		input: { prefix: 'The migration plan should account for the read-replica cutover' },
		expected: { noPreamble: true, noEcho: true, atMostTwoSentences: true },
		metadata: { layer: 'inline', note: 'Drives the completion generator directly.' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, inlineSuggestionWorkspace);
			const projectId = workspace.projectIds.get('Platform')!;
			const noteId = workspace.noteIds.get('Migration plan|Platform')!;
			const prefix = this.input.prefix as string;

			const suggestion = await lab.controllers
				.inlineSuggestions()
				.suggest(
					workspace.actor,
					requestFor(projectId, noteId, prefix),
					new AbortController().signal
				);

			const text = suggestion.outcome === 'suggested' ? suggestion.text : '';
			const lower = text.trim().toLowerCase();
			const noPreamble = !/^(sure|here|certainly|okay|i )/i.test(text.trim());
			const noEcho = !prefix.toLowerCase().includes(lower) || lower.length === 0;
			const sentences = (text.match(/[.!?](\s|$)/g) ?? []).length;

			px.logOutput({
				prefix,
				suggestion: text,
				grounding: suggestion.outcome === 'suggested' ? suggestion.grounding : undefined
			});
			px.logAnnotation({
				name: ARCHETYPES.inlineSuggestionShape,
				score: noPreamble && noEcho && sentences <= 2 ? 1 : 0,
				label: noPreamble && noEcho && sentences <= 2 ? 'clean' : 'malformed',
				explanation: `preamble=${!noPreamble} echo=${!noEcho} sentences=${sentences}`
			});

			expect(noPreamble, `suggestion began with a preamble: "${text}"`).toBe(true);
			expect(noEcho, `suggestion echoed the prefix: "${text}"`).toBe(true);
			expect(sentences, `suggestion ran to ${sentences} sentences`).toBeLessThanOrEqual(2);
		}
	},
	{
		id: 'inline-suggestion-grounding',
		name: 'grounds the continuation in project memory the passage never states',
		splits: [ARCHETYPES.inlineGrounding],
		input: { prefix: 'The read-replica cutover window is owned by' },
		expected: { mentionsOwner: 'Ana' },
		metadata: {
			layer: 'inline',
			note: 'The owner lives only in project memory; a correct completion proves project RAG ran.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, inlineSuggestionWorkspace);
			const projectId = workspace.projectIds.get('Platform')!;
			const noteId = workspace.noteIds.get('Migration plan|Platform')!;
			const prefix = this.input.prefix as string;
			const controller = lab.controllers.inlineSuggestions();
			const request = requestFor(projectId, noteId, prefix);

			const suggestion = await controller.suggest(
				workspace.actor,
				request,
				new AbortController().signal
			);

			const text = suggestion.outcome === 'suggested' ? suggestion.text : '';
			const hasProjectContext =
				suggestion.outcome === 'suggested' && suggestion.grounding.projectPassageCount > 0;
			const mentionsOwner = text.toLowerCase().includes('ana');
			px.logOutput({ prefix, suggestion: text, hasProjectContext });
			px.logAnnotation({
				name: ARCHETYPES.inlineGrounding,
				score: hasProjectContext && mentionsOwner ? 1 : hasProjectContext ? 0.5 : 0,
				label: !hasProjectContext
					? 'no_project_context'
					: mentionsOwner
						? 'grounded'
						: 'context_unused',
				explanation: hasProjectContext
					? mentionsOwner
						? 'named the owner from project memory'
						: 'project context was retrieved but the owner was not used'
					: 'project RAG returned no context'
			});

			expect(hasProjectContext, 'project RAG returned no context').toBe(true);
			expect(mentionsOwner, `continuation did not name the owner: "${text}"`).toBe(true);
		}
	}
];
