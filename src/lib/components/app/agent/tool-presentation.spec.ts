import { describe, expect, it } from 'vitest';
import { isWriteTool, toolDetailLines, toolStatusLabel } from './tool-presentation';

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
		).toEqual(['No arguments.']);
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
