import { describe, expect, it } from 'vitest';
import { toolStatusLabel } from './tool-presentation';

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
