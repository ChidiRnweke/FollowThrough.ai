import type { AgentEvent, ToolOutcomeEvent, ToolActivity } from '$lib/models/agent';

/**
 * The outcome an event settles, or nothing when it settles none.
 *
 * "Did this call finish?" is one question with one answer, and asking it as a
 * three-way `type` test at every reader is how the old single arm's
 * `!event.failure` test came to mean three different things in three files.
 */
export const toolOutcomeEvent = (event: AgentEvent): ToolOutcomeEvent | undefined =>
	event.type === 'tool_succeeded' ||
	event.type === 'tool_reported_failure' ||
	event.type === 'tool_failed'
		? event
		: undefined;

/** Project a resolved tool event into the journal activity shared by chat and diagrams. */
export const toolActivityFromEvent = (event: AgentEvent): ToolActivity | undefined => {
	if (event.type === 'tool_started')
		return { callId: event.callId, name: event.name, input: event.arguments, status: 'running' };
	if (event.type === 'approval_required')
		return {
			callId: event.callId,
			name: event.name,
			input: event.arguments,
			...(event.review ? { review: event.review } : {}),
			status: 'approval_required'
		};
	const outcome = toolOutcomeEvent(event);
	if (!outcome) return undefined;
	// The arguments are not restated on an outcome, and the row that opened the
	// call is the one that holds them; both journals key rows by `callId`.
	const settled = {
		...(outcome.callId === undefined ? {} : { callId: outcome.callId }),
		name: outcome.name,
		input: {}
	};
	if (outcome.type === 'tool_succeeded')
		return {
			...settled,
			...(outcome.output === undefined ? {} : { output: outcome.output }),
			status: 'succeeded'
		};
	return outcome.type === 'tool_failed'
		? { ...settled, failure: outcome.failure, status: 'failed' }
		: { ...settled, failure: outcome.failure, output: outcome.output, status: 'reported_failure' };
};
