import type { AgentToolSurface } from './agent-tool-factory';
import { restoredToolReviews } from '$lib/testing/agent/fixtures/tool-reviews';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
const noteMarkdown = new NodeNoteMarkdown();
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { describe, expect, it } from 'vitest';
import { RunContext } from '@openai/agents';
import { createAgentToolSurface } from './agent-tool-factory';
import type { AgentExecutionMode, PendingAgentDecision } from '$lib/models/agent';
import { noteChangeReviewSchema } from '$lib/models/notes';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';

import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import {
	noteBuilder,
	testActor,
	testConversationId,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = (kind: 'skill' | 'note' = 'skill', operation: 'replace' | 'patch' = 'replace') => {
	const note = noteBuilder({
		kind,
		title: 'Release checklist',
		...noteMarkdown.read('Check releases on Monday.')
	});
	const fixture = reviewedNoteFixture(note);
	const registry = (
		pending: readonly PendingAgentDecision[] = [],
		mode: AgentExecutionMode = 'approval_required'
	) =>
		createAgentToolSurface(
			testTokenizer,
			fixture.factory,
			testActor(),
			mode,
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Change release day' },
				model: 'test-model'
			},
			{ execute: (_call, action) => action() },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true },
			restoredToolReviews(fixture.factory, testActor(), pending)
		);
	const call: PendingAgentDecision = {
		callId: 'skill-change-1',
		toolName: operation === 'replace' ? 'save_skill' : 'edit_skill',
		arguments:
			operation === 'replace'
				? { noteId: note.id, markdown: 'Check releases on Tuesday.' }
				: { noteId: note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] }
	};
	const select = (tools: AgentToolSurface) => {
		const tool = tools.tools().find((item) => item.name === call.toolName);
		if (!tool || tool.type !== 'function') throw new Error('Expected the skill content tool');
		return tool;
	};
	const invoke = (tools: AgentToolSurface) =>
		select(tools).invoke(new RunContext(), JSON.stringify(call.arguments), {
			toolCall: {
				type: 'function_call',
				name: call.toolName,
				callId: call.callId,
				arguments: JSON.stringify(call.arguments)
			}
		});
	const prepare = async () => {
		const tools = registry();
		await select(tools).needsApproval(new RunContext(), call.arguments, call.callId);
		return tools.reviewDecision(call);
	};
	return { ...fixture, note, registry, call, select, invoke, prepare };
};

describe('Revision-bound skill content approvals', () => {
	it('stores the reviewed skill body with the pending approval', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		const review = pending.review
			? noteChangeReviewSchema.parse(JSON.parse(pending.review.content))
			: undefined;
		expect(review?.kind === 'prepared' ? review.change.result.plainText : review?.kind).toBe(
			'Check releases on Tuesday.'
		);
	});
	it.each(['replace', 'patch'] as const)(
		'refuses a stale %s approval after another writer saves the skill',
		async (operation) => {
			const fixture = setup('skill', operation);
			const pending = await fixture.prepare();
			await fixture.controller.save(testActor(), {
				note: { ...fixture.note, ...noteMarkdown.read('Check releases on Friday.') }
			});
			const result = await fixture.invoke(fixture.registry([pending]));
			expect({ result, text: fixture.content.notes[0].plainText }).toMatchObject({
				result: { code: 'STALE_REVIEW' },
				text: 'Check releases on Friday.'
			});
		}
	);
	it.each(['replace', 'patch'] as const)(
		'applies the saved %s review once across repeated delivery',
		async (operation) => {
			const fixture = setup('skill', operation);
			const pending = await fixture.prepare();
			await fixture.invoke(fixture.registry([pending]));
			await fixture.invoke(fixture.registry([pending]));
			expect(fixture.content.notes[0]).toMatchObject({
				plainText: 'Check releases on Tuesday.',
				currentRevision: 2,
				title: fixture.note.title,
				kind: 'skill',
				publishedRevision: fixture.note.publishedRevision
			});
		}
	);
	it.each(['replace', 'patch'] as const)(
		'rejects a %s checkpoint without its reviewed content',
		async (operation) => {
			const fixture = setup('skill', operation);
			expect(() => fixture.registry([fixture.call])).toThrow('missing its prepared review');
		}
	);
	it.each(['replace', 'patch'] as const)(
		'does not ask for a %s approval on an ordinary note',
		async (operation) => {
			const fixture = setup('note', operation);
			expect(
				await fixture
					.select(fixture.registry())
					.needsApproval(new RunContext(), fixture.call.arguments, fixture.call.callId)
			).toBe(false);
		}
	);
	it.each(['replace', 'patch'] as const)(
		'uses the same guarded %s path for automatic acceptance',
		async (operation) => {
			const fixture = setup('skill', operation);
			const result = await fixture.invoke(fixture.registry([], 'auto_accept'));
			expect({
				note: fixture.content.notes[0],
				patchResult:
					operation === 'patch'
						? { appliedEdits: result.appliedEdits, matchedTexts: result.matchedTexts }
						: undefined
			}).toEqual({
				note: expect.objectContaining({
					plainText: 'Check releases on Tuesday.',
					currentRevision: 2
				}),
				patchResult:
					operation === 'patch' ? { appliedEdits: 1, matchedTexts: ['Monday'] } : undefined
			});
		}
	);
	it('leaves an ordinary note unchanged when a skill tool is automatically accepted', async () => {
		const fixture = setup('note');
		await fixture.invoke(fixture.registry([], 'auto_accept'));
		expect(fixture.content.notes[0]).toEqual(fixture.note);
	});
	it('does not save when the requested skill text cannot be matched', async () => {
		const fixture = setup('skill', 'patch');
		await fixture.controller.save(testActor(), {
			note: { ...fixture.note, ...noteMarkdown.read('Check releases on Friday.') }
		});
		const before = fixture.content.notes[0];
		const result = await fixture.invoke(fixture.registry([], 'auto_accept'));
		expect({ result, note: fixture.content.notes[0] }).toMatchObject({
			result: { kind: 'failure', message: 'No changes were applied.' },
			note: before
		});
	});
});
