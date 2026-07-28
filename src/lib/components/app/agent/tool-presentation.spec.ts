import { describe, expect, it } from 'vitest';
import {
	approvalConsequence,
	isWriteTool,
	toolDetailLines,
	toolStatusLabel
} from './tool-presentation';

const tool = (name: string, status: 'succeeded' | 'failed' | 'rejected') => ({
	callId: 'call-1',
	name,
	arguments: {},
	status
});

describe('Tool presentation invariants', () => {
	it('describes a completed note save in human language', () => {
		expect(toolStatusLabel(tool('save_note', 'succeeded'))).toBe('Saved note');
	});

	it('describes a rejected note save in human language', () => {
		expect(toolStatusLabel(tool('save_note', 'rejected'))).toBe('Note change rejected');
	});

	it('describes another completed mutation without exposing its identifier', () => {
		expect(toolStatusLabel(tool('create_project', 'succeeded'))).toBe('Created project');
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
				...tool('save_note', 'failed'),
				arguments: { title: 'Notes' },
				failure: 'The note was locked.'
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
