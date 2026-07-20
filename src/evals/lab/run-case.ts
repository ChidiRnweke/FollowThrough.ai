import { randomUUID } from 'node:crypto';
import type {
	ActorContext,
	AgentExecutionMode,
	AgentRunEventRecord,
	AgentRunId,
	AgentRunStatus,
	NoteId,
	ProjectId
} from '$lib/models';
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
	readonly arguments: Readonly<Record<string, unknown>>;
	readonly output?: unknown;
	readonly failure?: string;
	/** True when the run paused for approval on this call instead of executing it. */
	readonly awaitingApproval?: boolean;
}

export interface AgentRunResult {
	readonly runId: AgentRunId;
	readonly conversationId: import('$lib/models').ConversationId;
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
	readonly selection?: import('$lib/models').TextSelection;
	readonly requestedSkillNames?: readonly string[];
	readonly conversationId?: import('$lib/models').ConversationId;
	readonly appContext?: import('$lib/models').AppContextSnapshotV1;
}

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

	const status = await waitForTerminalStatus(lab, actor, receipt.runId);
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
			const started = calls.get(event.callId);
			calls.set(event.callId, {
				callId: event.callId,
				name: started?.name ?? event.name,
				arguments: started?.arguments ?? {},
				...(event.output === undefined ? {} : { output: event.output }),
				...(event.failure ? { failure: event.failure } : {})
			});
			if (!started) order.push(event.callId);
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
