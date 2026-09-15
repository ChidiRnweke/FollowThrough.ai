import { describe, it, expect } from 'vitest';
import { RunContext } from '@openai/agents';
import { AgentTools } from './agent-tool-factory';
import {
	readPendingDecisions,
	type PendingAgentDecision,
	type AgentExecutionMode
} from '$lib/models/agent';
import { noteChangeReviewSchema } from '$lib/models/notes';
import { reviewedNoteFixture } from '$lib/testing/notes/fixtures/reviewed-changes';
import { noteContentFromMarkdown } from '$lib/server/services/notes/markdown';
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
		const persisted = readPendingDecisions(JSON.parse(JSON.stringify([pending]))).decisions;
		await fixture.invoke(fixture.registry(persisted));
		expect(fixture.content.notes[0].plainText).toBe('Launch Tuesday.');
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
	it('preserves a legacy approval as an explicit failure', async () => {
		const fixture = setup();
		expect(await fixture.invoke(fixture.registry([fixture.call]))).toMatchObject({
			failure: 'No changes were applied.',
			problems: [
				'This older approval has no saved review. Read the note and submit a new tool call.'
			]
		});
	});
	it('does not save when a legacy approval resumes', async () => {
		const fixture = setup();
		await fixture.invoke(fixture.registry([fixture.call]));
		expect(fixture.content.notes[0]).toEqual(fixture.note);
	});
	it('keeps an unreadable review resumable as an explicit failure', async () => {
		const fixture = setup();
		const pending: PendingAgentDecision = {
			...fixture.call,
			review: { kind: 'note_change', content: '{broken' }
		};
		expect(await fixture.invoke(fixture.registry([pending]))).toMatchObject({
			failure: 'No changes were applied.',
			problems: ['The saved note review is unreadable. Reject it and submit a new tool call.']
		});
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
			failure: 'No changes were applied.'
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
