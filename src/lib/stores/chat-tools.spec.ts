import { describe, expect, it } from 'vitest';
import { reconcileToolActivity, type ChatToolActivity } from './chat-tools';

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
});
