import { describe, expect, it } from 'vitest';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import { canvasSubject, canvasSubjectKey } from './canvas-subject';

const call = (name: string, output: unknown, index = 0): ChatToolActivity => ({
	callId: `call-${name}-${index}`,
	name,
	arguments: {},
	output,
	status: 'succeeded'
});

const DIAGRAM_ID = '6e000c5e-6679-44ef-a9f0-efee14f32310';
const DRAFT = call('present_diagram', { source: '<mxfile>one</mxfile>' });
const SAVED = call('accept_suggestion', {
	artifact: { id: DIAGRAM_ID, kind: 'drawio', title: 'Architecture' }
});

describe('What the conversation put on the canvas', () => {
	it('is the draft the agent presented', () => {
		expect(canvasSubject([DRAFT])).toEqual({
			kind: 'draft',
			draft: { kind: 'draft', source: '<mxfile>one</mxfile>' }
		});
	});

	// A revision is written onto the row before the tool answers, so the diagram's
	// own tab already holds it — and that tab is the one carrying History and
	// Publish. Routing it to a canvas of its own is what hid it from the user.
	it('is the saved diagram a revision was written onto', () => {
		const revision = call('present_diagram_revision', {
			source: '<mxfile/>',
			diagramId: DIAGRAM_ID
		});
		expect(canvasSubject([revision])).toEqual({ kind: 'saved', diagramId: DIAGRAM_ID });
	});

	it('does not trust a persistence id returned by the new-diagram tool', () => {
		const legacy = call('present_diagram', {
			source: '<mxfile/>',
			diagramId: DIAGRAM_ID
		});
		expect(canvasSubject([legacy])).toEqual({
			kind: 'draft',
			draft: { kind: 'draft', source: '<mxfile/>' }
		});
	});

	// The failure this whole reader exists for: a diagram the agent saved some
	// other way is still the diagram the user is talking about.
	it('is the saved diagram an accepted suggestion created', () => {
		expect(canvasSubject([SAVED])).toEqual({ kind: 'saved', diagramId: DIAGRAM_ID });
	});

	it('is the saved diagram the agent read', () => {
		const read = call('read_project_diagram', { id: DIAGRAM_ID, kind: 'drawio', labels: 'A\nB' });
		expect(canvasSubject([read])).toEqual({ kind: 'saved', diagramId: DIAGRAM_ID });
	});

	it('is whichever came last', () => {
		expect(canvasSubject([DRAFT, SAVED])).toEqual({ kind: 'saved', diagramId: DIAGRAM_ID });
	});

	it('ignores a call that has not succeeded', () => {
		expect(canvasSubject([{ ...DRAFT, status: 'running' }])).toBeUndefined();
	});

	it('falls back to the last good subject when output is malformed', () => {
		const broken = call('present_diagram', { source: '   ' }, 1);
		expect(canvasSubject([DRAFT, broken])).toMatchObject({ kind: 'draft' });
	});

	it('ignores a suggestion that did not create a diagram', () => {
		const todo = call('accept_suggestion', { artifact: { id: DIAGRAM_ID, title: 'Buy milk' } });
		expect(canvasSubject([todo])).toBeUndefined();
	});

	it('ignores tools that have nothing to do with diagrams', () => {
		expect(canvasSubject([call('save_note', { id: DIAGRAM_ID, kind: 'drawio' })])).toBeUndefined();
	});
});

describe('The key the canvas remembers a subject by', () => {
	// `canvasSubject` answers `CanvasSubject | undefined`; `canvasSubjectKey` takes
	// a subject. Narrowing here is the same narrowing every caller now does.
	const keyOf = (tools: readonly ChatToolActivity[]): string | undefined => {
		const subject = canvasSubject(tools);
		return subject ? canvasSubjectKey(subject) : undefined;
	};

	it('separates one draft revision from the next', () => {
		expect(keyOf([DRAFT])).not.toBe(
			keyOf([call('present_diagram', { kind: 'mermaid', source: 'x' })])
		);
	});

	it('is the same for the same saved diagram read twice', () => {
		expect(keyOf([SAVED])).toBe(keyOf([SAVED, SAVED]));
	});
});
