import { describe, expect, it } from 'vitest';
import { readPendingDecisions } from '$lib/models/agent';

/**
 * `agent_runs.pending_decisions` is declared
 * `jsonb('pending_decisions').$type<readonly PendingAgentDecision[]>()`, which is
 * the writer's promise about rows the writer has not seen. It was the last such
 * hand-out on the run row.
 *
 * A decision that does not read is dropped rather than raised on, because the
 * run row has to stay readable for the user to cancel the run. The resume it can
 * no longer answer already fails loudly through the interruption check in
 * `reasoning.ts`, which is where a user finds out.
 */
describe('Reading the pending decisions off a run row', () => {
	const decision = { callId: 'call-1', toolName: 'archive_note', arguments: { noteId: 'note-1' } };

	it('reads a stored decision back as itself', () => {
		expect(readPendingDecisions([decision]).decisions).toEqual([decision]);
	});

	it('reports nothing dropped when every decision reads', () => {
		expect(readPendingDecisions([decision]).dropped).toEqual([]);
	});

	it('drops a decision naming a tool the catalog no longer has', () => {
		expect(readPendingDecisions([{ ...decision, toolName: 'archive_notes' }]).decisions).toEqual(
			[]
		);
	});

	it('names the dropped call id, so the warning can point at it', () => {
		expect(readPendingDecisions([{ ...decision, toolName: 'archive_notes' }]).dropped).toEqual([
			'call-1'
		]);
	});

	it('keeps the readable decisions beside a dropped one', () => {
		expect(
			readPendingDecisions([{ ...decision, toolName: 'archive_notes' }, decision]).decisions
		).toEqual([decision]);
	});

	it('drops a decision with no call id at all, which nothing could answer', () => {
		expect(readPendingDecisions([{ toolName: 'archive_note', arguments: {} }]).dropped).toEqual([
			'unidentified'
		]);
	});

	it('rejects an unexpected field rather than carrying it inward', () => {
		expect(readPendingDecisions([{ ...decision, decidedAt: '2026-09-02' }]).decisions).toEqual([]);
	});

	it('reads an empty column, which is what it holds at rest', () => {
		expect(readPendingDecisions([]).decisions).toEqual([]);
	});

	it('answers a column that is not an array at all with no decisions', () => {
		expect(readPendingDecisions('call-1').decisions).toEqual([]);
	});
});
