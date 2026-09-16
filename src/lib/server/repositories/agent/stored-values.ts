import { z } from 'zod';
import { readAgentPayload } from '$lib/models/agent/payload';
import type { AgentEvent } from '$lib/models/agent';
import type { NoteActionResult } from './agent-runs';

/** The storage boundary serializes the resolved domain result into the event protocol. */
export const noteActionEvent = (result: NoteActionResult): AgentEvent => {
	const parsed = readAgentPayload(result.result);
	if (parsed.kind === 'corrupt')
		throw new Error(`Note action result cannot be stored: ${parsed.message}`);
	return { type: 'workflow_result', action: result.action, result: parsed.value };
};
import {
	pendingDecisionIdentitySchema,
	pendingAgentDecisionSchema,
	agentEventSchema,
	agentRunContextSchema,
	emptyAgentRunContextSchema,
	runAgentInputSchema,
	type PendingAgentDecision,
	type StoredPendingDecisions,
	type StoredAgentEvent,
	type AgentRunContext,
	type ConversationId,
	type RunAgentInput
} from '$lib/models/agent';

/** The call id of a decision that did not parse, for the warning that reports it. */
const readCallId = (row: unknown): string | undefined =>
	pendingDecisionIdentitySchema.safeParse(row).data?.callId;

/**
 * Reads the `agent_runs.pending_decisions` column.
 *
 * A decision that does not read is dropped rather than raised on: the run row
 * still has to be readable so the user can cancel the run, and a resume that
 * lands on none of its interruptions already fails loudly with "The pending
 * approval could not be resumed". The dropped call ids come back so the caller
 * can warn with them, which is what `SuggestionInbox.listByStatus` does with
 * unreadable suggestion rows.
 *
 * Legacy decisions without a review remain readable and rejectable. Note tooling
 * refuses to apply them because they do not identify an authorized base and result.
 */
export const readPendingDecisions = (value: unknown): StoredPendingDecisions => {
	if (!Array.isArray(value))
		return {
			kind: 'corrupt',
			reason: 'Pending approval storage is not an array',
			decisions: [],
			dropped: []
		};
	const rows: readonly unknown[] = value;
	const decisions: PendingAgentDecision[] = [];
	const dropped: string[] = [];
	for (const row of rows) {
		const parsed = pendingAgentDecisionSchema.safeParse(row);
		if (parsed.success) decisions.push(parsed.data);
		else dropped.push(readCallId(row) ?? 'unidentified');
	}
	return { kind: 'readable', decisions, dropped };
};

/**
 * One stored row as an event, or the reason it could not be read.
 *
 * A row that does not parse degrades to one skipped event rather than throwing:
 * `toNote` mapped every row of a note list and a single unmodelled attribute
 * took `/today` down whole (TN-14). A replay is the same shape of read.
 *
 * There is no mapping for the retired `tool_completed` shape. The rows written
 * under it read as `unreadable` with a reason. Replay preserves their cursors;
 * a reopened conversation reads the journal instead.
 */
export const readAgentEvent = (value: unknown): StoredAgentEvent => {
	const parsed = agentEventSchema.safeParse(value);
	return parsed.success
		? { kind: 'readable', event: parsed.data }
		: { kind: 'unreadable', reason: z.prettifyError(parsed.error) };
};

export const parseAgentRunContextSnapshot = (value: unknown): AgentRunContext | undefined => {
	if (emptyAgentRunContextSchema.safeParse(value).success) return undefined;
	return agentRunContextSchema.parse(value);
};

export const parseRunAgentInput = (
	input: unknown,
	expectedConversationId: ConversationId
): RunAgentInput =>
	runAgentInputSchema
		.refine((candidate) => candidate.conversationId === expectedConversationId, {
			path: ['conversationId'],
			message: 'Run input conversation does not match its persisted run'
		})
		.parse(input);
