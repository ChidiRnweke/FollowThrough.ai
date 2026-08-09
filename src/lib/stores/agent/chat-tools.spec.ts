import { describe, expect, it } from 'vitest';
import { reconcileToolActivity, unwrapToolCall, type ChatToolActivity } from './chat-tools';

const runningTool = (callId = 'call-1'): ChatToolActivity => ({
	callId,
	name: 'find_references',
	arguments: { query: 'agent skills' },
	status: 'running'
});

describe('chat tool activity reconciliation', () => {
	it('updates a completed call in place', () => {
		const tools = [runningTool()];
		reconcileToolActivity(tools, {
			callId: 'call-1',
			name: 'find_references',
			arguments: {},
			output: { count: 2 },
			status: 'succeeded'
		});
		expect(tools).toEqual([
			{
				callId: 'call-1',
				name: 'find_references',
				arguments: { query: 'agent skills' },
				output: { count: 2 },
				status: 'succeeded'
			}
		]);
	});

	it('deduplicates repeated start events', () => {
		const tools = [runningTool()];
		reconcileToolActivity(tools, runningTool());
		expect(tools).toHaveLength(1);
	});

	it('returns undefined for an unseen call so the caller can place it in the flow', () => {
		expect(reconcileToolActivity([], runningTool())).toBeUndefined();
	});

	it('keeps a second parked call apart from the first', () => {
		const tools = [{ ...runningTool('call-1'), status: 'approval_required' as const }];
		const merged = reconcileToolActivity(tools, {
			callId: 'call-2',
			name: 'archive_note',
			arguments: {},
			status: 'approval_required'
		});
		expect(merged).toBeUndefined();
	});

	it('reconciles a provider completion without an id to the only active call', () => {
		const tools = [runningTool()];
		reconcileToolActivity(tools, {
			callId: '',
			name: 'tool',
			arguments: {},
			status: 'succeeded'
		});
		expect(tools[0]?.status).toBe('succeeded');
	});

	it('keeps the unwrapped name when the wrapper reports the outcome', () => {
		const tools: ChatToolActivity[] = [
			{ callId: 'call-1', name: 'save_note', arguments: { noteId: 'note-1' }, status: 'running' }
		];
		reconcileToolActivity(tools, {
			callId: 'call-1',
			name: 'use_tool',
			arguments: {},
			status: 'succeeded'
		});
		expect(tools[0]?.name).toBe('save_note');
	});
});

const envelope = (args: Record<string, unknown>): ChatToolActivity => ({
	callId: 'call-1',
	name: 'use_tool',
	arguments: args,
	status: 'running'
});

describe('use_tool unwrapping', () => {
	it('names the dispatched tool rather than the wrapper', () => {
		expect(unwrapToolCall(envelope({ name: 'save_note', payload: { noteId: 'note-1' } })).name).toBe(
			'save_note'
		);
	});

	it('lifts the nested payload to the call arguments', () => {
		expect(
			unwrapToolCall(envelope({ name: 'save_note', payload: { noteId: 'note-1' } })).arguments
		).toEqual({ noteId: 'note-1' });
	});

	it('accepts arguments sent as a flat object', () => {
		expect(
			unwrapToolCall(envelope({ name: 'get_note', arguments: { noteId: 'note-2' } })).arguments
		).toEqual({ noteId: 'note-2' });
	});

	it('accepts arguments sent as a JSON string', () => {
		expect(
			unwrapToolCall(envelope({ name: 'get_note', arguments: '{"noteId":"note-3"}' })).arguments
		).toEqual({ noteId: 'note-3' });
	});

	it('drops an unparseable argument string rather than showing it as a field', () => {
		expect(unwrapToolCall(envelope({ name: 'get_note', arguments: 'not json' })).arguments).toEqual(
			{}
		);
	});

	it('leaves an envelope that names no tool as it arrived', () => {
		expect(unwrapToolCall(envelope({ payload: { noteId: 'note-1' } })).name).toBe('use_tool');
	});

	it('leaves an ordinary call untouched', () => {
		const call = runningTool();
		expect(unwrapToolCall(call)).toBe(call);
	});
});
