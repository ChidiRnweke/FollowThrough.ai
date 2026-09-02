import type { AgentPayload } from '$lib/models/agent/payload';
import { describe, expect, it } from 'vitest';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { canvasDiagramId } from './canvas-subject';

const call = (name: AgentToolName, output: AgentPayload, index = 0): ChatToolActivity => ({
	callId: `call-${name}-${index}`,
	name,
	arguments: {},
	output,
	status: 'succeeded'
});

const DIAGRAM_ID = '6e000c5e-6679-44ef-a9f0-efee14f32310';
const OTHER_ID = '9a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d';
const SAVED = call('accept_suggestion', {
	artifact: { id: DIAGRAM_ID, kind: 'drawio', title: 'Architecture' }
});

describe('The diagram on a conversation canvas', () => {
	it('is the diagram a create wrote', () => {
		const created = call('create_diagram', { diagramId: DIAGRAM_ID });
		expect(canvasDiagramId([created])).toBe(DIAGRAM_ID);
	});

	it('is the diagram an edit wrote', () => {
		const edited = call('edit_diagram', { diagramId: DIAGRAM_ID });
		expect(canvasDiagramId([edited])).toBe(DIAGRAM_ID);
	});

	// A diagram the agent reached some other way is still the one being discussed,
	// and leaving these out ended a request at "Accept suggestion completed" with
	// nothing to look at.
	it('is the saved diagram an accepted suggestion created', () => {
		expect(canvasDiagramId([SAVED])).toBe(DIAGRAM_ID);
	});

	it('is the saved diagram the agent read', () => {
		const read = call('read_project_diagram', { id: DIAGRAM_ID, kind: 'drawio', labels: 'A' });
		expect(canvasDiagramId([read])).toBe(DIAGRAM_ID);
	});

	it('is whichever came last', () => {
		const created = call('create_diagram', { diagramId: OTHER_ID });
		expect(canvasDiagramId([created, SAVED])).toBe(DIAGRAM_ID);
	});

	it('ignores a call that has not succeeded', () => {
		const running = { ...call('create_diagram', { diagramId: DIAGRAM_ID }), status: 'running' };
		expect(canvasDiagramId([running as never])).toBeUndefined();
	});

	it('says nothing when the conversation has drawn nothing', () => {
		expect(canvasDiagramId([])).toBeUndefined();
	});
});
