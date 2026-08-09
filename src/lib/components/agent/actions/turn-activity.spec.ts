import { describe, expect, it } from 'vitest';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { turnActivity, turnSteps } from './turn-activity';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const OTHER_NOTE_ID = '2c9b0b53-9c2f-4c1a-9f0b-6b7c9b1f2a34';

const shell = {
	projects: [],
	noteTree: [
		{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary,
		{ id: OTHER_NOTE_ID, title: 'Runtime notes' } as unknown as NoteSummary
	]
} as unknown as ShellContext;

let nextCall = 0;
const call = (over: Partial<ChatToolActivity>): ChatToolActivity => ({
	callId: `call-${++nextCall}`,
	name: 'get_note',
	arguments: { noteId: NOTE_ID },
	status: 'succeeded',
	...over
});

describe('A turn reports things, not calls', () => {
	it('folds repeated work on one note into a single entry', () => {
		const activity = turnActivity([call({}), call({}), call({ name: 'save_note' })], shell);
		expect(activity.touched).toHaveLength(1);
	});

	it('reports the strongest thing that happened to it', () => {
		const activity = turnActivity([call({}), call({ name: 'save_note' }), call({})], shell);
		expect(activity.touched[0]?.verb).toBe('edited');
	});

	it('names the note so the reader recognises it', () => {
		expect(turnActivity([call({})], shell).touched[0]?.title).toBe('Infrastructure');
	});

	it('keeps two different notes apart', () => {
		const activity = turnActivity(
			[call({}), call({ arguments: { noteId: OTHER_NOTE_ID } })],
			shell
		);
		expect(activity.touched).toHaveLength(2);
	});

	it('offers the id so the entry can be opened', () => {
		expect(turnActivity([call({})], shell).touched[0]?.id).toBe(NOTE_ID);
	});
});

describe('Mechanism the agent needs is not work the user did', () => {
	it('leaves a tool search out of the summary', () => {
		const activity = turnActivity(
			[call({ name: 'search_tools', arguments: { query: 'save_note' } })],
			shell
		);
		expect(activity.touched).toEqual([]);
	});

	it('leaves a search out of the summary, having no single subject', () => {
		const activity = turnActivity([call({ name: 'search', arguments: { query: 'bugs' } })], shell);
		expect(activity.touched).toEqual([]);
	});

	it('still counts every call, so the details door knows it has something to open', () => {
		const activity = turnActivity([call({ name: 'search_tools', arguments: {} }), call({})], shell);
		expect(activity.callCount).toBe(2);
	});
});

describe('A failure is news only when nothing put it right', () => {
	it('says nothing about a failed call the agent then retried successfully', () => {
		const activity = turnActivity(
			[
				call({ name: 'save_note', status: 'failed', failure: 'Not callable directly.' }),
				call({ name: 'save_note' })
			],
			shell
		);
		expect(activity.failures).toEqual([]);
	});

	it('says nothing about a failure the agent put right after speaking in between', () => {
		const failed = call({ name: 'save_note', status: 'failed', failure: 'Not callable.' });
		const succeeded = call({ name: 'save_note' });
		// The two attempts land in different groups because the agent spoke between them; the
		// question of whether it was put right belongs to the turn.
		expect(turnActivity([failed], shell, [failed, succeeded]).failures).toEqual([]);
	});

	it('says nothing about a malformed attempt the agent then got right', () => {
		// A rejected payload names no note, so only the tool it was trying to be identifies it.
		const malformed = {
			...call({ name: 'save_note', status: 'failed', failure: 'Invalid payload.' }),
			arguments: {}
		};
		const succeeded = call({ name: 'save_note' });
		expect(turnActivity([malformed], shell, [malformed, succeeded]).failures).toEqual([]);
	});

	it('reports a failure that stood', () => {
		const activity = turnActivity(
			[call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })],
			shell
		);
		expect(activity.failures.map((tool) => tool.failure)).toEqual(['The note was locked.']);
	});

	it('marks the entry itself as failed so the row can say so', () => {
		const activity = turnActivity(
			[call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })],
			shell
		);
		expect(activity.touched[0]?.failed).toBe(true);
	});
});

describe('Something the agent just made is still openable', () => {
	it('takes a created note id from what the call returned', () => {
		const activity = turnActivity(
			[
				call({
					name: 'create_note',
					arguments: { title: 'Reviewed draft' },
					output: { noteId: OTHER_NOTE_ID }
				})
			],
			shell
		);
		expect(activity.touched[0]?.id).toBe(OTHER_NOTE_ID);
	});

	it('names it from the arguments when the tree has not caught up', () => {
		const activity = turnActivity(
			[call({ name: 'create_note', arguments: { title: 'Reviewed draft' } })],
			shell
		);
		expect(activity.touched[0]?.title).toBe('Reviewed draft');
	});

	it('falls back to a plain label rather than an id nobody can read', () => {
		const activity = turnActivity([call({ arguments: { noteId: 'unknown-note' } })], shell);
		expect(activity.touched[0]?.title).toBe('A note');
	});
});

describe('A running turn shows its steps as they arrive', () => {
	it('keeps each call while the turn is still working', () => {
		expect(turnSteps([call({}), call({}), call({ name: 'save_note' })], shell)).toHaveLength(3);
	});

	it('marks the call in flight as pending', () => {
		expect(turnSteps([call({ status: 'running' })], shell)[0]?.pending).toBe(true);
	});

	it('leaves a change awaiting approval to the approval, which shows it in full', () => {
		expect(turnSteps([call({ name: 'save_note', status: 'approval_required' })], shell)).toEqual(
			[]
		);
	});
});
