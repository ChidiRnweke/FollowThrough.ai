import { describe, expect, it } from 'vitest';
import { TOOL_DESCRIPTIONS } from '$lib/models/agent/tool-catalog';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import { opensInPlace, toolDisclosure, toolFamily } from './tool-disclosure';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const TODO_ID = '2b1f0c44-1d3e-4a90-9f21-77c6b0a1e5d3';

const shell = {
	projects: [],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const call = (over: Partial<ChatToolActivity>): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name: 'get_note',
	arguments: {},
	status: 'succeeded',
	...over
});

const familyOf = (over: Partial<ChatToolActivity>): string =>
	toolDisclosure(call(over), shell).kind;

describe('Every tool in the catalog knows what it opens onto', () => {
	// The server keeps `AgentToolCoverage` total over controller methods so a capability cannot
	// be added without being classified. This is the same guarantee on the reading side: a tool
	// nobody classified would otherwise fall through to a shape guess and quietly render as the
	// generic bucket this module exists to abolish.
	it('classifies every catalog entry by name rather than by guessing at its payload', () => {
		const unclassified = TOOL_DESCRIPTIONS.map((entry) => entry.name).filter(
			(name) => toolFamily(name) === undefined
		);
		expect(unclassified).toEqual([]);
	});
});

describe('A read of one thing is a link, not a disclosure', () => {
	it('names the note the shell already knows', () => {
		const disclosure = toolDisclosure(
			call({ name: 'get_note', arguments: { noteId: NOTE_ID } }),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'link',
			entity: { kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true }
		});
	});

	it('offers no chevron, because the row already says everything it has', () => {
		expect(opensInPlace(toolDisclosure(call({ name: 'get_note' }), shell))).toBe(false);
	});
});

describe('A read of many things shows what came back', () => {
	it('finds the collection one key down and counts it', () => {
		const disclosure = toolDisclosure(
			call({ name: 'list_todos', output: { todos: [{ id: TODO_ID, title: 'Draft the RFC' }] } }),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'collection',
			entities: [{ kind: 'todo', id: TODO_ID, title: 'Draft the RFC', named: true }],
			total: 1
		});
	});

	it('caps the rows it hands over while still reporting the true total', () => {
		const todos = Array.from({ length: 9 }, (_, index) => ({ title: `Todo ${index}` }));
		const disclosure = toolDisclosure(call({ name: 'list_todos', output: { todos } }), shell);
		expect(
			disclosure.kind === 'collection' && [disclosure.entities.length, disclosure.total]
		).toEqual([5, 9]);
	});
});

describe('A body rewritten earns a real before and after', () => {
	it('carries the note and the revision the diff is taken against', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'save_note',
				arguments: { noteId: NOTE_ID, markdown: '# New' },
				output: { noteId: NOTE_ID, title: 'Infrastructure', currentRevision: 7 }
			}),
			shell
		);
		expect(disclosure).toEqual({ kind: 'note-diff', noteId: NOTE_ID, revision: 7 });
	});

	it('falls back to stating what was sent when there is no note to diff', () => {
		expect(familyOf({ name: 'save_note', arguments: { markdown: '# New' }, output: {} })).toBe(
			'record'
		);
	});
});

describe('A field set on an existing record shows what moved', () => {
	it('states the change without a before when the tool returns none', () => {
		const disclosure = toolDisclosure(
			call({ name: 'update_todo', arguments: { todoId: TODO_ID, status: 'done' } }),
			shell
		);
		expect(disclosure.kind === 'record' && disclosure.changed).toEqual([
			{ label: 'Status', to: 'done' }
		]);
	});

	it('states both sides when the tool troubles to return the previous value', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'update_agent_preferences',
				arguments: { defaultModel: 'claude-opus-5' },
				output: { previous: { defaultModel: 'claude-sonnet-5' } }
			}),
			shell
		);
		expect(disclosure.kind === 'record' && disclosure.changed).toEqual([
			{ label: 'Default model', from: 'claude-sonnet-5', to: 'claude-opus-5' }
		]);
	});

	it('does not offer an id back to the reader as a field they changed', () => {
		const disclosure = toolDisclosure(
			call({ name: 'update_todo', arguments: { todoId: TODO_ID, title: 'Ship it' } }),
			shell
		);
		expect(
			disclosure.kind === 'record' && disclosure.changed.map((change) => change.label)
		).toEqual(['Title']);
	});
});

describe('Things brought into existence are openable from the moment they are named', () => {
	it('takes the id from the result, which is the only place a create puts it', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'create_todo',
				arguments: { title: 'Book the review' },
				output: { id: TODO_ID }
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'created',
			entities: [{ kind: 'todo', id: TODO_ID, title: 'Book the review', named: true }]
		});
	});

	it('handles a batch as the several things it made', () => {
		const disclosure = toolDisclosure(
			call({ name: 'create_todos', output: { todos: [{ title: 'One' }, { title: 'Two' }] } }),
			shell
		);
		expect(
			disclosure.kind === 'created' && disclosure.entities.map((entity) => entity.title)
		).toEqual(['One', 'Two']);
	});
});

describe('A change to whether a thing exists says whether it can be undone', () => {
	it('marks a trashed note as recoverable, and still openable', () => {
		expect(
			toolDisclosure(call({ name: 'archive_note', arguments: { noteId: NOTE_ID } }), shell)
		).toEqual({
			kind: 'lifecycle',
			entity: { kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true },
			recoverable: true
		});
	});

	it('marks a permanent delete as not', () => {
		expect(
			toolDisclosure(call({ name: 'delete_note_forever', arguments: { noteId: NOTE_ID } }), shell)
		).toEqual({
			kind: 'lifecycle',
			entity: { kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true },
			recoverable: false
		});
	});
});

describe('Work put up for review is routed to the surface that reviews it', () => {
	it('sends a memory proposal to the memory set it has to be judged against', () => {
		expect(toolDisclosure(call({ name: 'propose_memory_change' }), shell)).toEqual({
			kind: 'proposal',
			scope: 'memory'
		});
	});

	it('sends everything else to the suggestion review', () => {
		expect(toolDisclosure(call({ name: 'extract_promises' }), shell)).toEqual({
			kind: 'proposal',
			scope: 'suggestion'
		});
	});
});

describe('A failure outranks whatever the call was going to show', () => {
	it('replaces the family with an explanation in the reader terms', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'edit_note',
				status: 'failed',
				failure: 'oldText was not found in the note.'
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'failure',
			explanation:
				'The text it meant to change was not where it expected. The note may have moved on since it read it.'
		});
	});
});
