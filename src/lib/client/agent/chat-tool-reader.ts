import { z } from 'zod';
import { noteChangeReviewSchema, type NoteChangeReview } from '$lib/models/notes';
import { agentPayloadObjectResultSchema, type AgentPayloadObject } from '$lib/models/agent/payload';
import type { AgentReview } from '$lib/models/agent';
import {
	journalledToolSchema,
	type JournalledTool,
	type ChatToolActivityBase
} from '$lib/models/chat';
export const toolArguments = (value: unknown): AgentPayloadObject => {
	const read = agentPayloadObjectResultSchema.parse(value);
	return read.kind === 'valid' ? read.value : {};
};

/**
 * One journalled `tool_activity` row as a transcript row, or the reason it could
 * not be read.
 *
 * The journal is JSON with no schema behind it, and this used to be read with
 * `String(content.callId ?? '')`, `String(content.status ?? 'succeeded') as
 * ChatToolStatus`, and a bare `typeof` for the failure — three different guesses
 * about one stored shape, one of which could mint a status no arm of this union
 * has. An id the row does not carry stays absent, because that absence is what
 * `matchToolActivity` settles a row by.
 */
/** Interpret the domain payload once where a checkpoint/event enters the browser. */
export const readNoteReview = (review: AgentReview): NoteChangeReview => {
	try {
		return noteChangeReviewSchema.parse(JSON.parse(review.content));
	} catch {
		return {
			kind: 'failure',
			problems: ['The saved review could not be read. Reject this call and request a new review.']
		};
	}
};

export const readJournalledTool = (
	content: unknown,
	provenance: { readonly runId?: string }
): JournalledTool => {
	const parsed = journalledToolSchema.safeParse(content);
	if (!parsed.success) return { kind: 'unreadable', reason: z.prettifyError(parsed.error) };
	const row = parsed.data;
	const base: ChatToolActivityBase = {
		...(row.callId ? { callId: row.callId } : {}),
		name: row.name,
		arguments: toolArguments(row.input ?? {}),
		...(provenance.runId ? { runId: provenance.runId } : {})
	};
	// `null` is how the archive spells an absent optional, because the wire type
	// cannot carry `undefined`. Both spellings mean the field is not there.
	const output = row.output ?? undefined;
	const failure = row.failure ?? undefined;
	if (row.status === 'running') return { kind: 'readable', tool: { ...base, status: 'running' } };
	if (row.status === 'approval_required')
		return {
			kind: 'readable',
			tool: {
				...base,
				status: 'approval_required',
				...(row.review ? { noteReview: readNoteReview(row.review) } : {})
			}
		};
	if (row.status === 'succeeded')
		return {
			kind: 'readable',
			tool: { ...base, ...(output === undefined ? {} : { output }), status: 'succeeded' }
		};
	// A settled row that says it failed and does not say how, or that reported a
	// failure without the value it read it out of, is a row this reader cannot
	// reconstruct — the writer always supplies both.
	if (failure === undefined)
		return { kind: 'unreadable', reason: `a ${row.status} row carries no failure` };
	if (row.status === 'failed')
		return { kind: 'readable', tool: { ...base, failure, status: 'failed' } };
	return output === undefined
		? { kind: 'unreadable', reason: 'a reported_failure row carries no output' }
		: { kind: 'readable', tool: { ...base, failure, output, status: 'reported_failure' } };
};
