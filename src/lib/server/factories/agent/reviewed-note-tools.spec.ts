import { TodoPresentationService } from '$lib/services/todos/presentation';
import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { describe, it, expect } from 'vitest';
import { RunContext } from '@openai/agents';
import { AgentTools } from './agent-tool-factory';
import { type PendingAgentDecision, type AgentExecutionMode } from '$lib/models/agent';
import { readPendingDecisions } from '$lib/server/repositories/agent/stored-values';
import { noteChangeReviewSchema } from '$lib/models/notes';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import {
	noteContentFromMarkdown,
	noteMarkdownFromContent
} from '$lib/server/services/notes/markdown';
import { InMemoryToolRetriever } from '$lib/testing/agent/fakes/in-memory-agent';
import {
	noteBuilder,
	testActor,
	testProvenanceId,
	testConversationId
} from '$lib/testing/workspace/fixtures/domain-builders';

const context = () => new RunContext();
const setup = () => {
	const note = noteBuilder({ ...noteContentFromMarkdown('Launch Monday.'), title: 'Release' });
	const fixture = reviewedNoteFixture(note);
	const registry = (
		pending: readonly PendingAgentDecision[] = [],
		mode: AgentExecutionMode = 'approval_required'
	) =>
		new AgentTools(
			testTokenizer,
			fixture.factory,
			testActor(),
			mode,
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Change launch day' },
				model: 'test-model'
			},
			{ execute: (_call, action) => action() },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true },
			pending
		);
	const call: PendingAgentDecision = {
		callId: 'note-edit-1',
		toolName: 'edit_note',
		arguments: { noteId: note.id, edits: [{ oldText: 'Monday', newText: 'Tuesday' }] }
	};
	const select = (tools: AgentTools, name = call.toolName) => {
		const tool = tools.tools().find((item) => item.name === name);
		if (!tool || tool.type !== 'function') throw new Error('Expected note function tool');
		return tool;
	};
	const invoke = (tools: AgentTools, pending = call) =>
		select(tools, pending.toolName).invoke(context(), JSON.stringify(pending.arguments), {
			toolCall: {
				type: 'function_call',
				name: pending.toolName,
				callId: pending.callId,
				arguments: JSON.stringify(pending.arguments)
			}
		});
	const prepare = async () => {
		const tools = registry();
		await select(tools).needsApproval(context(), call.arguments, call.callId);
		return tools.reviewDecision(call);
	};
	return { ...fixture, note, call, registry, select, invoke, prepare };
};

describe('Revision-bound note tool approvals', () => {
	it('stores the reviewed base and candidate with the pending call', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		if (!pending.review) throw new Error('Expected a review');
		expect(noteChangeReviewSchema.parse(JSON.parse(pending.review.content))).toMatchObject({
			kind: 'prepared',
			change: { base: { revision: 1, title: 'Release' }, result: { plainText: 'Launch Tuesday.' } }
		});
	});
	it('applies the checkpoint after recreating the registry', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		if (!pending.review) throw new Error('Expected a review');
		const review = noteChangeReviewSchema.parse(JSON.parse(pending.review.content));
		const persisted = readPendingDecisions(JSON.parse(JSON.stringify([pending]))).decisions;
		await fixture.invoke(fixture.registry(persisted));
		expect({ review, appliedBody: fixture.content.notes[0].plainText }).toMatchObject({
			review: {
				kind: 'prepared',
				change: {
					base: { revision: 1, title: 'Release' },
					result: { plainText: 'Launch Tuesday.' }
				}
			},
			appliedBody: 'Launch Tuesday.'
		});
	});
	it('refuses to reinterpret an approved patch after the note changes', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		fixture.content.notes = [
			{
				...fixture.note,
				...noteContentFromMarkdown('Launch Monday. Include a second launch.'),
				currentRevision: 2
			}
		];
		expect(await fixture.invoke(fixture.registry([pending]))).toMatchObject({
			code: 'STALE_REVIEW'
		});
	});
	it('does not let a later preparation replace an already reviewed base', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		fixture.content.notes = [
			{ ...fixture.note, ...noteContentFromMarkdown('Launch Friday.'), currentRevision: 2 }
		];
		const resumed = fixture.registry([pending]);
		await fixture
			.select(resumed)
			.needsApproval(context(), fixture.call.arguments, fixture.call.callId);
		expect(resumed.reviewDecision(fixture.call)).toEqual(pending);
	});
	it('rejects a checkpoint without its prepared review', () => {
		const fixture = setup();
		expect(() => fixture.registry([fixture.call])).toThrow('missing its prepared review');
	});
	it('rejects an unreadable checkpoint', () => {
		const fixture = setup();
		const pending: PendingAgentDecision = {
			...fixture.call,
			review: { kind: 'note_change', content: '{broken' }
		};
		expect(() => fixture.registry([pending])).toThrow();
	});
	it('keeps a second pending review intact across partial approvals', async () => {
		const fixture = setup();
		const first = await fixture.prepare();
		const second = { ...first, callId: 'note-edit-2' };
		const resumed = fixture.registry([first, second]);
		await fixture.invoke(resumed);
		expect(resumed.reviewDecision(second)).toEqual(second);
	});
	it('returns an unchanged receipt when a committed review is retried', async () => {
		const fixture = setup();
		const pending = await fixture.prepare();
		await fixture.invoke(fixture.registry([pending]));
		expect(await fixture.invoke(fixture.registry([pending]))).toMatchObject({ currentRevision: 2 });
	});
	it('uses the same preparation for automatic acceptance', async () => {
		const fixture = setup();
		await fixture.invoke(fixture.registry([], 'auto_accept'));
		expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
	});
	it('returns a preparation failure without asking for approval', async () => {
		const fixture = setup();
		const tools = fixture.registry();
		const args = { noteId: fixture.note.id, edits: [{ oldText: 'absent', newText: 'Tuesday' }] };
		expect(await fixture.select(tools).needsApproval(context(), args, fixture.call.callId)).toBe(
			false
		);
	});
	it('does not re-read a rejected preparation at execution', async () => {
		const fixture = setup();
		const tools = fixture.registry();
		const call = {
			...fixture.call,
			arguments: { noteId: fixture.note.id, edits: [{ oldText: 'Friday', newText: 'Tuesday' }] }
		};
		await fixture.select(tools).needsApproval(context(), call.arguments, call.callId);
		fixture.content.notes = [
			{ ...fixture.note, ...noteContentFromMarkdown('Launch Friday.'), currentRevision: 2 }
		];
		expect(await fixture.invoke(tools, call)).toMatchObject({
			kind: 'failure',
			message: 'No changes were applied.'
		});
	});
	it('binds whole-body replacements to their reviewed revision too', async () => {
		const fixture = setup();
		const tools = fixture.registry();
		const call: PendingAgentDecision = {
			callId: 'note-save',
			toolName: 'save_note',
			arguments: { noteId: fixture.note.id, markdown: 'Launch Tuesday.' }
		};
		await fixture.select(tools, 'save_note').needsApproval(context(), call.arguments, call.callId);
		const pending = tools.reviewDecision(call);
		fixture.content.notes = [
			{ ...fixture.note, ...noteContentFromMarkdown('Launch Friday.'), currentRevision: 2 }
		];
		expect(await fixture.invoke(fixture.registry([pending]), call)).toMatchObject({
			code: 'STALE_REVIEW'
		});
	});
});

/**
 * Preparation runs inside `needsApproval`, which sits outside the runner's
 * `errorFunction`. A throw there is not turned into a tool result: it aborts the whole
 * turn, so the model is told nothing and cannot correct anything. That is what happened
 * in production when the Markdown converter and the note schema drifted apart — the agent
 * re-sent the same save six times in five minutes because every attempt killed its turn
 * before a failure could reach it.
 */
describe('A note change that fails while it is being prepared', () => {
	const faulty = () => {
		const note = noteBuilder({ ...noteContentFromMarkdown('Launch Monday.'), title: 'Release' });
		const content = new InMemoryNoteContent();
		content.notes = [note];
		const controller = new Notes(
			capabilityDependencies<NotesDependencies>({
				todoPresentation: new TodoPresentationService(),
				textSearch: new NoteTextSearchService(),
				noteReferences: new NoteReferenceService(),
				sections: new NoteSectionNumberingService(),
				noteCreationRules: new NoteLifecycleRulesService(),
				noteTrashRules: new NoteLifecycleRulesService(),
				notePublicationRules: new NoteLifecycleRulesService(),
				noteEditingRules: new NoteEditingRulesService(),
				notePresentation: new NotePresentationService(),
				suggestionPresentation: new SuggestionPresentationService(),
				markdown: {
					read: () => {
						throw new TypeError('document.content[12] is not writable');
					},
					write: noteMarkdownFromContent
				},
				noteReader: content,
				noteEditor: content,
				anchorRepairer: content,
				noteLinkReconciler: content,
				noteIndexer: content,
				transactionRunner: new InMemoryTransactionRunner([content])
			})
		);
		const tools = new AgentTools(
			testTokenizer,
			capabilityDependencies<ControllerFactory>({ notes: () => controller }),
			testActor(),
			'approval_required',
			{
				provenanceId: testProvenanceId(),
				input: { conversationId: testConversationId(), prompt: 'Rewrite the note' },
				model: 'test-model'
			},
			{ execute: (_call, action) => action() },
			new InMemoryToolRetriever(),
			{ isEnabled: () => true },
			[]
		);
		const args = { noteId: note.id, markdown: '# Plan\n\n---\n\nBody.\n' };
		const tool = tools.tools().find((item) => item.name === 'save_note');
		if (!tool || tool.type !== 'function') throw new Error('Expected the save_note tool');
		return { tool, args, callId: 'note-save-1' };
	};

	it('returns a safe failure to the model without aborting or exposing the internal error', async () => {
		const { tool, args, callId } = faulty();
		const approvalRequired = await tool.needsApproval(context(), args, callId);
		const result = await tool.invoke(context(), JSON.stringify(args), {
			toolCall: {
				type: 'function_call',
				name: 'save_note',
				callId,
				arguments: JSON.stringify(args)
			}
		});
		const message = JSON.stringify(result);
		expect({
			approvalRequired,
			failure: readToolFailure(result),
			takesResponsibility: message.includes('The fault is ours, not your arguments.'),
			leaksInternalText: message.includes('is not writable')
		}).toEqual({
			approvalRequired: false,
			failure: expect.any(String),
			takesResponsibility: true,
			leaksInternalText: false
		});
	});
});
