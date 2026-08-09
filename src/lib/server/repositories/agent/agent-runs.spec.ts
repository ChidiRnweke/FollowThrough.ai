import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRunId } from '$lib/models/agent';
import { segmentOutput } from './agent-runs';

const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;

let cursor = 0;
const at = (event: AgentEvent) => ({ cursor: String(++cursor), event });

const text = (value: string): AgentEvent => ({ type: 'text_delta', text: value });
const thinking = (value: string): AgentEvent => ({ type: 'reasoning_delta', text: value });
const toolStarted = (): AgentEvent => ({
	type: 'tool_started',
	callId: 'c1',
	name: 'get_note',
	arguments: {}
});

describe('A turn is folded into the runs of output it was', () => {
	it('joins the deltas of one run into a single segment', () => {
		expect(segmentOutput([at(text('Hello ')), at(text('there.'))])).toHaveLength(1);
	});

	it('keeps thinking apart from speech', () => {
		expect(segmentOutput([at(thinking('Hmm.')), at(text('Done.'))]).map((s) => s.kind)).toEqual([
			'reasoning',
			'text'
		]);
	});

	it('splits one run of speech into two when work happened between them', () => {
		expect(
			segmentOutput([at(text('Reading.')), at(toolStarted()), at(text('Done.'))]).map((s) => s.text)
		).toEqual(['Reading.', 'Done.']);
	});

	it('remembers where a segment began, which is what puts the turn back in order', () => {
		const segments = segmentOutput([
			{ cursor: '1', event: text('a') },
			{ cursor: '2', event: toolStarted() },
			{ cursor: '3', event: text('b') }
		]);
		expect(segments.at(-1)?.cursor).toBe('3');
	});

	it('ignores events that are neither', () => {
		expect(segmentOutput([at({ type: 'run_started', runId, attempt: 1 })])).toEqual([]);
	});
});
