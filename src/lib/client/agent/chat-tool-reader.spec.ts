import type { AgentPayload } from '$lib/models/agent/payload';
import { noteReviewBuilder } from '$lib/testing/notes/fixtures/note-review';
import { readNoteReview } from '$lib/client/agent/chat-tool-reader';
import { describe, expect, it } from 'vitest';
import { readJournalledTool, toolArguments } from '$lib/client/agent/chat-tool-reader';

describe('Reading a journalled tool row back into the transcript', () => {
	const row = (content: Record<string, AgentPayload>) =>
		readJournalledTool(content, { runId: 'run-1' });

	it('restores a succeeded call with the result it returned', () => {
		expect(
			row({
				type: 'tool_activity',
				callId: 'call-1',
				name: 'save_note',
				input: { noteId: 'note-1' },
				output: { noteId: 'note-1' },
				failure: null,
				status: 'succeeded'
			})
		).toEqual({
			kind: 'readable',
			tool: {
				callId: 'call-1',
				name: 'save_note',
				arguments: { noteId: 'note-1' },
				runId: 'run-1',
				output: { noteId: 'note-1' },
				status: 'succeeded'
			}
		});
	});

	it('restores a reported failure with both the message and its detail', () => {
		expect(
			row({
				type: 'tool_activity',
				callId: 'call-9',
				name: 'edit_note',
				input: {},
				output: {
					kind: 'failure',
					code: 'NOTE_REVIEW_FAILED',
					message: 'No edits were applied.',
					recovery: 'Correct the problems below and submit a new tool call.',
					details: {}
				},
				failure: 'No edits were applied.',
				status: 'reported_failure'
			})
		).toEqual({
			kind: 'readable',
			tool: {
				callId: 'call-9',
				name: 'edit_note',
				arguments: {},
				runId: 'run-1',
				failure: 'No edits were applied.',
				output: {
					kind: 'failure',
					code: 'NOTE_REVIEW_FAILED',
					message: 'No edits were applied.',
					recovery: 'Correct the problems below and submit a new tool call.',
					details: {}
				},
				status: 'reported_failure'
			}
		});
	});

	/**
	 * The absence is load-bearing: `matchToolActivity` settles an id-less outcome by
	 * name and recency, and it can only do that if the row does not spell the missing
	 * id `''`. This read used to be `String(content.callId ?? '')`.
	 */
	it('leaves an id the row does not carry absent rather than spelling it empty', () => {
		const read = row({
			type: 'tool_activity',
			callId: null,
			name: 'search',
			input: {},
			output: null,
			failure: null,
			status: 'succeeded'
		});
		expect(read.kind === 'readable' && 'callId' in read.tool).toBe(false);
	});

	it('refuses a status no arm of the union has, rather than minting one', () => {
		expect(row({ type: 'tool_activity', name: 'search', input: {}, status: 'nearly' }).kind).toBe(
			'unreadable'
		);
	});

	it('refuses a settled row that says it failed without saying how', () => {
		expect(
			row({ type: 'tool_activity', name: 'search', input: {}, failure: null, status: 'failed' })
				.kind
		).toBe('unreadable');
	});
});

describe('Reading the arguments a call was made with', () => {
	it('keeps an object of arguments as they are', () => {
		expect(toolArguments({ query: 'skills' })).toEqual({ query: 'skills' });
	});

	it('records no arguments when the payload is not an object', () => {
		expect(toolArguments(['skills'])).toEqual({});
	});
});

describe('Reading saved note reviews', () => {
	it('reads the prepared document from a journalled approval', () => {
		const noteReview = noteReviewBuilder();
		const parsed = readJournalledTool(
			{
				name: 'save_note',
				callId: 'review-1',
				status: 'approval_required',
				input: { noteId: noteReview.change.noteId, markdown: 'Tuesday' },
				review: { kind: 'note_change', content: JSON.stringify(noteReview) }
			},
			{}
		);
		expect(parsed).toMatchObject({
			kind: 'readable',
			tool: { status: 'approval_required', noteReview }
		});
	});
	it('reports corrupt review JSON explicitly', () => {
		expect(readNoteReview({ kind: 'note_change', content: '{' })).toMatchObject({
			kind: 'failure'
		});
	});
	it('rejects incomplete prepared documents instead of inventing a base', () => {
		expect(
			readNoteReview({
				kind: 'note_change',
				content: JSON.stringify({ kind: 'prepared', change: { noteId: 'missing-base' } })
			})
		).toMatchObject({ kind: 'failure' });
	});
});
