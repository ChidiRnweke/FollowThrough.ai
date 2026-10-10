import { expect, it } from 'vitest';
import { AgentReadTool } from './read-tool';
import { AgentPayloadInspectionService } from '$lib/services/agent/payload';
import { ToolResultBoundary } from '$lib/server/adapters/agent/read-tool';
import type { AgentPayload } from '$lib/models/agent/payload';

it('filters nested dated rows inclusively and preserves undated results', async () => {
	const result: AgentPayload = {
		items: [
			{ createdAt: '2026-10-01', title: 'Before' },
			{ createdAt: '2026-10-02', title: 'First' },
			{ title: 'Undated' },
			{ createdAt: '2026-10-03', title: 'Last' },
			{ createdAt: '2026-10-04', title: 'After' }
		]
	};
	const tool = new AgentReadTool(
		async () => result,
		new ToolResultBoundary<AgentPayload>(),
		new AgentPayloadInspectionService()
	);
	expect(await tool.run({}, { createdAfter: '2026-10-02', createdBefore: '2026-10-03' })).toEqual({
		items: [
			{ createdAt: '2026-10-02', title: 'First' },
			{ title: 'Undated' },
			{ createdAt: '2026-10-03', title: 'Last' }
		]
	});
});
it('reports an unrepresentable result rather than producing an empty success', async () => {
	const tool = new AgentReadTool(
		async () => new Date('2026-10-02'),
		new ToolResultBoundary<Date>(),
		new AgentPayloadInspectionService()
	);
	await expect(tool.run({}, {})).rejects.toThrow('Tool output could not be represented as JSON');
});
it('propagates the controller failure without filtering it into a success', async () => {
	const tool = new AgentReadTool(
		async () => {
			throw new Error('Read failed');
		},
		new ToolResultBoundary<AgentPayload>(),
		new AgentPayloadInspectionService()
	);
	await expect(tool.run({}, {})).rejects.toThrow('Read failed');
});
