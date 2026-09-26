import { expect, it } from 'vitest';
import { resultItem } from '$lib/testing/agent/session-items';
import { testDiagramId } from '$lib/testing/workspace/fixtures/domain-builders';
import { readCanvasSessionResult } from './canvas-results';

it('decodes a plain-string diagram result', () => {
	const item = {
		...resultItem('create_diagram', 'call-1', ''),
		output: JSON.stringify({ diagramId: testDiagramId() })
	};
	expect(readCanvasSessionResult(item)).toEqual({ kind: 'written', diagramId: testDiagramId() });
});

it('preserves malformed diagram JSON as an explicit corrupt result', () => {
	expect(readCanvasSessionResult(resultItem('edit_diagram', 'call-1', '{')).kind).toBe('corrupt');
});

it('ignores malformed output from a different tool', () => {
	expect(readCanvasSessionResult(resultItem('save_note', 'call-1', '{'))).toEqual({
		kind: 'unrelated'
	});
});

it('does not interpret a multipart output as one diagram result', () => {
	const part = { type: 'text', text: JSON.stringify({ diagramId: testDiagramId() }) } as const;
	const item = { ...resultItem('create_diagram', 'call-1', ''), output: [part] };
	expect(readCanvasSessionResult(item)).toEqual({ kind: 'unrelated' });
});

it('does not invent an identity from an empty diagram id', () => {
	expect(
		readCanvasSessionResult(resultItem('create_diagram', 'call-1', '{"diagramId":" "}'))
	).toEqual({ kind: 'unrelated' });
});
