import { randomUUID } from 'node:crypto';
import type { ActorContext } from '$lib/models/identity';
import type {
	AgentExecutionMode,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunStatus,
	ConversationId
} from '$lib/models/agent';
import type { NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { Lab } from './application';

const TERMINAL: readonly AgentRunStatus[] = [
	'completed',
	'failed',
	'cancelled',
	'awaiting_approval'
];

export interface ToolCall {
	readonly callId: string;
	readonly name: string;
	readonly arguments: AgentPayloadObject;
	readonly output?: unknown;
	readonly failure?: string;
	/** True when the run paused for approval on this call instead of executing it. */
	readonly awaitingApproval?: boolean;
}

export interface AgentRunResult {
	readonly runId: AgentRunId;
	readonly conversationId: ConversationId;
	readonly status: AgentRunStatus;
	readonly finalResponse: string;
	readonly toolCalls: readonly ToolCall[];
	readonly failure?: string;
	readonly model: string;
	readonly durationMs: number;
	readonly events: readonly AgentRunEventRecord[];
	/** Names in call order, the form most assertions want. */
	readonly calledToolNames: readonly string[];
}

export interface RunCaseInput {
	readonly prompt: string;
	readonly mode?: AgentExecutionMode;
	readonly projectId?: ProjectId;
	readonly noteId?: NoteId;
	readonly contextNoteIds?: readonly NoteId[];
	readonly selection?: TextSelection;
	readonly requestedSkillNames?: readonly string[];
	readonly conversationId?: ConversationId;
	readonly appContext?: AppContextSnapshotV1;
}

/**
 * Leaves enough room inside Vitest's 420-second boundary for the controller's
 * ten-second cancellation backstop and result persistence. The 390-second
 * default is calibrated from the recorded 445-second provider stall that
 * otherwise continued into the next case.
 */
export const evalCaseDeadlineMs = (value = process.env.EVAL_CASE_TIMEOUT_MS): number => {
	const parsed = Number(value ?? 390_000);
	if (!Number.isFinite(parsed) || parsed <= 0)
		throw new Error(`EVAL_CASE_TIMEOUT_MS must be a positive number, received ${String(value)}`);
	return parsed;
};

/**
 * Drives one agent turn along the production path: submit through the agent
 * controller, wait for a terminal status, then read the outcome back out of the
 * persisted event log. Nothing here inspects the agent loop directly — the
 * result is assembled from the same rows the UI renders from, so an eval that
 * passes is evidence the whole durable path works, not just the model call.
 */
export async function runCase(
	lab: Lab,
	actor: ActorContext,
	input: RunCaseInput
): Promise<AgentRunResult> {
	const startedAt = Date.now();
	const agent = lab.controllers.agent();
	const receipt = await agent.submit(actor, {
		requestId: randomUUID(),
		input: input.prompt,
		...(input.conversationId ? { conversationId: input.conversationId } : {}),
		...(input.appContext ? { appContext: input.appContext } : {}),
		...(input.mode ? { mode: input.mode } : {}),
		...(input.projectId ? { projectId: input.projectId } : {}),
		...(input.noteId ? { noteId: input.noteId } : {}),
		...(input.contextNoteIds ? { contextNoteIds: input.contextNoteIds } : {}),
		...(input.selection ? { selection: input.selection } : {}),
		...(input.requestedSkillNames ? { requestedSkillNames: input.requestedSkillNames } : {})
	});

	const terminalStatus = waitForTerminalStatus(lab, actor, receipt.runId);
	let deadline: ReturnType<typeof setTimeout> | undefined;
	const cancelledStatus = new Promise<AgentRunStatus>((resolve, reject) => {
		deadline = setTimeout(() => {
			void agent
				.cancel(actor, receipt.runId)
				.then(() => terminalStatus)
				.then(resolve, reject);
		}, evalCaseDeadlineMs());
	});
	let status: AgentRunStatus;
	try {
		status = await Promise.race([terminalStatus, cancelledStatus]);
	} finally {
		if (deadline) clearTimeout(deadline);
	}
	const snapshot = await agent.getRun(actor, receipt.runId);
	const events = await agent.listRunEvents(actor, receipt.runId, '');

	return {
		runId: receipt.runId,
		conversationId: receipt.conversationId,
		status,
		finalResponse: reconstructText(events),
		toolCalls: reconstructToolCalls(events),
		calledToolNames: reconstructToolCalls(events).map((call) => call.name),
		...(snapshot.run.failure ? { failure: snapshot.run.failure } : {}),
		model: snapshot.run.model,
		durationMs: Date.now() - startedAt,
		events
	};
}

/**
 * Waits for the run to reach a durable terminal status.
 *
 * Driven by the event bus, which fires on every persisted transition, with a
 * slow poll as a safety net. The poll is not redundant: a missed notification
 * would otherwise hang the case until the test timeout and report as a vague
 * "test timed out" rather than as whatever actually happened to the run, which
 * is a miserable thing to debug.
 */
function waitForTerminalStatus(
	lab: Lab,
	actor: ActorContext,
	runId: AgentRunId
): Promise<AgentRunStatus> {
	return new Promise<AgentRunStatus>((resolve, reject) => {
		let settled = false;
		const finish = (outcome: () => void) => {
			if (settled) return;
			settled = true;
			unsubscribe();
			clearInterval(poll);
			outcome();
		};

		const check = () => {
			// audit-allow: silent-catch — the polling Promise propagates lookup failure through its reject continuation.
			lab.controllers
				.agent()
				.getRun(actor, runId)
				.then((snapshot) => {
					if (TERMINAL.includes(snapshot.run.status)) finish(() => resolve(snapshot.run.status));
				})
				.catch((error: unknown) => finish(() => reject(error)));
		};

		const unsubscribe = lab.eventBus.subscribe(runId, check);
		const poll = setInterval(check, 1000);
		// The run may already have finished between submit and subscribe.
		check();
	});
}

const reconstructText = (events: readonly AgentRunEventRecord[]): string =>
	events
		.map((record) => record.event)
		.filter((event) => event.type === 'text_delta')
		.map((event) => (event as { text: string }).text)
		.join('');

function reconstructToolCalls(events: readonly AgentRunEventRecord[]): readonly ToolCall[] {
	const calls = new Map<string, ToolCall>();
	const order: string[] = [];

	for (const { event } of events) {
		if (event.type === 'tool_started') {
			if (!calls.has(event.callId)) order.push(event.callId);
			calls.set(event.callId, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments
			});
			continue;
		}
		if (event.type === 'tool_completed') {
			// A completion the run could not name settles no call here. Correlating it
			// by guesswork would attribute an outcome to a call that may not be its
			// own, and an eval reads these records as evidence.
			const { callId } = event;
			if (callId === undefined) continue;
			const started = calls.get(callId);
			calls.set(callId, {
				callId,
				name: started?.name ?? event.name,
				arguments: started?.arguments ?? {},
				...(event.output === undefined ? {} : { output: event.output }),
				...(event.failure ? { failure: event.failure } : {})
			});
			if (!started) order.push(callId);
			continue;
		}
		if (event.type === 'approval_required') {
			if (!calls.has(event.callId)) order.push(event.callId);
			calls.set(event.callId, {
				callId: event.callId,
				name: event.name,
				arguments: event.arguments,
				awaitingApproval: true
			});
		}
	}

	return order
		.map((callId) => calls.get(callId))
		.filter((call): call is ToolCall => call !== undefined);
}
