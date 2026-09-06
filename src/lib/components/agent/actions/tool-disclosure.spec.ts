import { describe, expect, it } from 'vitest';
import { TOOL_DESCRIPTIONS } from '$lib/models/agent/tool-catalog';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import { opensInPlace, toolDisclosure, toolFamily } from './tool-disclosure';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
const TODO_ID = '2b1f0c44-1d3e-4a90-9f21-77c6b0a1e5d3';

const shell = {
	projects: [],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const call = (over: ToolActivityOverrides): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name: 'get_note',
	arguments: {},
	status: 'succeeded',
	...over
});

const familyOf = (over: ToolActivityOverrides): string => toolDisclosure(call(over), shell).kind;

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

	it('retains every returned row for user-controlled expansion', () => {
		const todos = Array.from({ length: 9 }, (_, index) => ({ title: `Todo ${index}` }));
		const disclosure = toolDisclosure(call({ name: 'list_todos', output: { todos } }), shell);
		expect(
			disclosure.kind === 'collection' && [disclosure.entities.length, disclosure.total]
		).toEqual([9, 9]);
	});
});

describe('A completed write names its target without fetching history', () => {
	it('carries an openable note without a diff', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'save_note',
				arguments: { noteId: NOTE_ID, markdown: '# New' },
				output: { noteId: NOTE_ID, title: 'Infrastructure', currentRevision: 7 }
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'link',
			entity: { kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true }
		});
	});

	it('names the note even when the shell cannot, so the body still has a title to show', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'edit_note',
				arguments: { noteId: '00000000-0000-4000-8000-0000000000bb' },
				output: { noteId: '00000000-0000-4000-8000-0000000000bb', title: 'Rossel' }
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'link',
			entity: {
				kind: 'note',
				id: '00000000-0000-4000-8000-0000000000bb',
				title: 'Rossel',
				named: true
			}
		});
	});

	it('does not synthesize a diff for a legacy receipt without a target', () => {
		expect(familyOf({ name: 'save_note', arguments: {}, output: {} })).toBe('link');
	});
});

describe('A look inside the virtual files shows what came back', () => {
	it('shows the lines a search matched, named by the note they matched in', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'grep',
				arguments: { pattern: 'element61', path: '/' },
				output: {
					kind: 'matches',
					exitCode: 0,
					pattern: 'element61',
					path: '/',
					matches: [
						{
							path: `/projects/proj-1/notes/${NOTE_ID}.md`,
							lineNumber: 12,
							line: 'element61 should own the rollout'
						}
					]
				}
			}),
			shell
		);
		// No count of what came back. The lines are the count, and the turn files each one
		// under the note it was found in, which is where the reader reads it.
		expect(disclosure).toEqual({
			kind: 'file-output',
			sources: [{ kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true }],
			lines: [
				{
					text: 'element61 should own the rollout',
					lineNumber: 12,
					source: { kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true }
				}
			]
		});
	});

	it('says so plainly when a search matched nothing', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'grep',
				arguments: { pattern: 'nope', path: '/' },
				output: {
					kind: 'no_matches',
					exitCode: 1,
					pattern: 'nope',
					path: '/',
					searchedFileCount: 4,
					nextActions: []
				}
			}),
			shell
		);
		expect(disclosure).toEqual({ kind: 'file-output', lines: [], sources: [] });
	});

	it('numbers the lines of an excerpt', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'sed',
				arguments: { path: `/projects/proj-1/notes/${NOTE_ID}.md` },
				output: {
					kind: 'content',
					path: `/projects/proj-1/notes/${NOTE_ID}.md`,
					startLine: 3,
					endLine: 4,
					lineCount: 9,
					content: 'alpha\nbeta',
					nextActions: []
				}
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'file-output',
			sources: [{ kind: 'note', id: NOTE_ID, title: 'Infrastructure', named: true }],
			lines: [
				{ text: 'alpha', lineNumber: 3 },
				{ text: 'beta', lineNumber: 4 }
			]
		});
	});

	it('states the message of a read that the files refused', () => {
		const disclosure = toolDisclosure(
			call({
				name: 'sed',
				arguments: { path: '/nowhere' },
				output: {
					kind: 'error',
					code: 'path_not_found',
					message: 'No file or directory exists at /nowhere.',
					requestedPath: '/nowhere',
					nextActions: []
				}
			}),
			shell
		);
		expect(disclosure).toEqual({
			kind: 'file-output',
			lines: [],
			sources: [],
			problem: 'No file or directory exists at /nowhere.'
		});
	});

	it('earns no chevron while the call is still running', () => {
		expect(
			familyOf({ name: 'grep', arguments: { pattern: 'x', path: '/' }, status: 'running' })
		).toBe('none');
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
		).toEqual([]);
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
			entity: { kind: 'note', title: 'Infrastructure', named: true },
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

describe('Grouped and heterogeneous results preserve their targets', () => {
	it('includes every Today group', () => {
		const result = toolDisclosure(
			call({
				name: 'get_today_view',
				output: {
					overdue: [{ id: TODO_ID, title: 'Overdue' }],
					dueToday: [{ title: 'Today' }],
					waitingOn: [{ title: 'Waiting' }],
					pinnedNotes: [{ id: NOTE_ID, title: 'Pinned' }],
					recentNotes: [{ title: 'Recent' }],
					pendingSuggestionCount: 2
				}
			}),
			shell
		);
		expect(result.kind === 'collection' && result.entities.map((entity) => entity.title)).toEqual([
			'Overdue',
			'Today',
			'Waiting',
			'Pinned',
			'Recent',
			'2 pending suggestions'
		]);
	});
	it('uses the actual source kind in mixed search results', () => {
		const result = toolDisclosure(
			call({
				name: 'search',
				output: [
					{ source: { kind: 'note', noteId: NOTE_ID, title: 'Note' } },
					{ source: { kind: 'diagram', diagramId: TODO_ID, title: 'Diagram' } }
				]
			}),
			shell
		);
		expect(
			result.kind === 'collection' && result.entities.map(({ kind, id }) => ({ kind, id }))
		).toEqual([
			{ kind: 'note', id: NOTE_ID },
			{ kind: 'diagram', id: TODO_ID }
		]);
	});
	it('does not report missing recorded output as an empty collection', () => {
		expect(toolDisclosure(call({ name: 'list_todos' }), shell)).toEqual({ kind: 'none' });
	});
});
