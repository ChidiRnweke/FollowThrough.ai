import type { ShellContext } from '$lib/client/shell/views';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import { describe, expect, it } from 'vitest';

import {
	approvalConsequence,
	isWriteTool,
	toolDetailLines,
	toolStatusLabel,
	toolStatusParts
} from './tool-presentation';

// Generic on the status so the literal survives into `ChatToolActivity`'s arms:
// a builder answering the whole status union can only produce a value that is
// none of them. `failed` gets its own builder because its arm needs a message —
// which is the point, a failure has to say what went wrong.
const tool = <Status extends 'succeeded' | 'rejected' | 'running'>(
	name: AgentToolName,
	status: Status
) => ({
	callId: 'call-1',
	name,
	arguments: {},
	status
});

const failedTool = (name: AgentToolName, failure: string) => ({
	callId: 'call-1',
	name,
	arguments: {},
	failure,
	status: 'failed' as const
});

describe('Tool presentation invariants', () => {
	it('describes a completed note save in human language', () => {
		expect(toolStatusLabel(tool('save_note', 'succeeded'))).toBe('Saved note');
	});

	it('labels and marks a rejected note save as failed', () => {
		const rejected = tool('save_note', 'rejected');
		expect({ label: toolStatusLabel(rejected), failed: toolStatusParts(rejected).failed }).toEqual({
			label: 'Note change rejected',
			failed: true
		});
	});

	it('describes another completed mutation without exposing its identifier', () => {
		expect(toolStatusLabel(tool('create_project', 'succeeded'))).toBe('Created project');
	});
});

describe('A read names the note it read', () => {
	const noteId = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
	const shell = {
		projects: [],
		noteTree: [{ id: noteId, title: 'Runtime notes' }]
	} as unknown as ShellContext;
	const read = <Status extends 'succeeded' | 'rejected' | 'running'>(status: Status) => ({
		...tool('get_note', status),
		arguments: { noteId }
	});

	it('names the note and makes it available to open', () => {
		const result = read('succeeded');
		expect({
			label: toolStatusLabel(result, shell),
			noteId: toolStatusParts(result, shell).noteId
		}).toEqual({
			label: 'Read note · Runtime notes',
			noteId
		});
	});

	it('keeps the plain label when the note is not in the tree', () => {
		expect(toolStatusLabel(read('succeeded'), { noteTree: [] } as unknown as ShellContext)).toBe(
			'Read note'
		);
	});

	it('keeps the plain label when no shell is available', () => {
		expect(toolStatusLabel(read('succeeded'))).toBe('Read note');
	});

	it('names the note while the read is still running', () => {
		expect(toolStatusLabel({ ...read('succeeded'), status: 'running' }, shell)).toBe(
			'Read note · Runtime notes…'
		);
	});

	it('leaves a tool that does not act on a note alone', () => {
		expect(
			toolStatusLabel({ ...tool('create_project', 'succeeded'), arguments: { noteId } }, shell)
		).toBe('Created project');
	});

	it('keeps navigation when the note is outside the current tree', () => {
		expect(
			toolStatusParts(read('succeeded'), { noteTree: [] } as unknown as ShellContext).noteId
		).toBe(noteId);
	});
});

describe('Every call in the log is named in the reader language', () => {
	it('names a search of the notes and files by what it looked for', () => {
		expect(
			toolStatusLabel({
				...tool('grep', 'succeeded'),
				arguments: { pattern: 'northwind', path: '/' }
			})
		).toBe('Searched notes and files · northwind');
	});
});

describe('A file path subject resolves to the note it points at', () => {
	const noteId = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';
	const shell = {
		projects: [],
		noteTree: [{ id: noteId, title: 'Runtime notes' }]
	} as unknown as ShellContext;
	const excerpt = () => ({
		...tool('sed', 'succeeded'),
		arguments: { path: `/projects/proj-1/notes/${noteId}.md` }
	});

	it('names the note and makes the excerpt source available to open', () => {
		const result = excerpt();
		expect({
			label: toolStatusLabel(result, shell),
			noteId: toolStatusParts(result, shell).noteId
		}).toEqual({
			label: 'Read file excerpt · Runtime notes',
			noteId
		});
	});

	it('identifies an attachment source as an attachment', () => {
		expect(
			toolStatusParts(
				{ ...tool('sed', 'succeeded'), arguments: { path: '/projects/proj-1/attachments/a.txt' } },
				shell
			).subject
		).toBe('An attachment');
	});
});

describe('The subject is what the reader recognises', () => {
	it('names the note a create is about before it exists in the tree', () => {
		expect(
			toolStatusParts({ ...tool('create_note', 'succeeded'), arguments: { title: 'Runtime' } })
				.subject
		).toBe('Runtime');
	});

	it('names a search query without making it a note to open', () => {
		const result = { ...tool('search', 'succeeded'), arguments: { query: 'agent skills' } };
		expect({
			subject: toolStatusParts(result).subject,
			noteId: toolStatusParts(result).noteId
		}).toEqual({
			subject: 'agent skills',
			noteId: undefined
		});
	});
});

describe('Tool disclosure detail', () => {
	it('shows the arguments a tool actually ran with', () => {
		expect(
			toolDetailLines({ ...tool('create_todo', 'succeeded'), arguments: { title: 'Call Maya' } })
		).toEqual(['Title: Call Maya']);
	});

	it('shows the failure instead of the arguments when a tool failed', () => {
		expect(
			toolDetailLines({
				...failedTool('save_note', 'The note was locked.'),
				arguments: { title: 'Notes' }
			})
		).toEqual(['The note was locked.']);
	});

	it('says so plainly when a tool took no arguments', () => {
		expect(toolDetailLines(tool('get_note', 'succeeded'))).toEqual(['No arguments.']);
	});

	it('omits non-scalar arguments that would not read as a line', () => {
		expect(
			toolDetailLines({ ...tool('create_todo', 'succeeded'), arguments: { payload: { a: 1 } } })
		).toEqual(['No details to show.']);
	});

	it('says a tool had arguments even when none of them were readable', () => {
		expect(
			toolDetailLines({
				...tool('create_todo', 'succeeded'),
				arguments: { noteId: '9e8e1812-0a7c-474d-96e4-65c5b60b3f75' }
			})
		).toEqual(['No details to show.']);
	});

	it('keeps identifiers out of the lines a person reads', () => {
		expect(
			toolDetailLines({
				...tool('create_note', 'succeeded'),
				arguments: { title: 'Runtime', projectId: 'e0d3f07c-460b-40c3-9b8c-a8dc00ddc565' }
			})
		).toEqual(['Title: Runtime']);
	});
});

describe('Approval consequences are stated only where they bite', () => {
	it('warns that archiving hides a note', () => {
		expect(approvalConsequence('archive_note')).toContain('restore it later');
	});

	it('says nothing extra about an ordinary create', () => {
		expect(approvalConsequence('create_note')).toBeUndefined();
	});
});

describe('Write and read tools are distinguishable', () => {
	it('treats creating a todo as a write', () => {
		expect(isWriteTool('create_todo')).toBe(true);
	});

	it('treats reading a note as not a write', () => {
		expect(isWriteTool('get_note')).toBe(false);
	});
});
