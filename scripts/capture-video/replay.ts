import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Sql } from 'postgres';
import type {
	Json,
	JsonObject,
	ScriptedCall,
	ScriptedTurn
} from '../capture-screenshots/journal.ts';
import type { PromiseProposal, ScriptedResume } from '../capture-screenshots/walkthrough.ts';

/**
 * How fast the replay speaks. Measured against a GPT-class model streaming through OpenRouter in
 * October 2026: roughly 35 words a second, with a tool call parked for one to two seconds.
 */
export interface ReplayPace {
	/** Milliseconds between two text deltas. */
	readonly delta: number;
	/** Milliseconds a call shows as running before its result lands. */
	readonly call: number;
}

/** What `submitAgentRun` returns for a run the replay owns. A type, so it is a `Json` object. */
export type ReplayReceipt = {
	readonly runId: string;
	readonly conversationId: string;
	readonly status: 'running';
	readonly latestCursor: string;
};

/** The call a turn parked on, as the chat sends it back with the user's decision. */
export interface ParkedCall {
	readonly callId: string;
	readonly name: string;
}

/** How a played turn ended: finished, or parked on a call that waits for the user. */
export type ReplayOutcome =
	{ readonly kind: 'completed' } | { readonly kind: 'parked'; readonly call: ParkedCall };

const READ_ONLY = /^(get|list|search|read|find|diff)_/;

const callId = (): string => `call_${randomBytes(12).toString('hex')}`;

/** Split text the way a model streams it: a few words per delta, whitespace attached. */
const deltas = (text: string): readonly string[] => {
	const words = text.match(/\S+\s*/g) ?? [];
	const sizes = [2, 1, 3, 1, 2, 2, 1];
	const chunks: string[] = [];
	for (let index = 0, step = 0; index < words.length; step += 1) {
		const size = sizes[step % sizes.length] ?? 1;
		chunks.push(words.slice(index, index + size).join(''));
		index += size;
	}
	return chunks;
};

/**
 * Replays a scripted turn through the real run stream: every event is its own commit, so the
 * `agent_run:<runId>` notification fires for each one and the open chat panel streams it, exactly
 * as it does for a model-backed run. Nothing here calls a model; the calls' `perform` seeds what
 * the real tools would have written, just before their result is announced.
 */
export class RunReplay {
	constructor(
		private readonly sql: Sql,
		private readonly pace: ReplayPace
	) {}

	/** Store the conversation, the user's message and a `running` run: what submitting does. */
	async start(turn: ScriptedTurn): Promise<ReplayReceipt> {
		const now = new Date();
		return this.sql.begin(async (tx) => {
			const [conversation] = await tx<{ id: string }[]>`
				insert into conversations (
					user_id, kind, context_project_id, context_note_id, title, created_at, updated_at
				) values (
					${turn.userId}, 'chat', ${turn.projectId}, ${turn.noteId}, ${turn.title}, ${now}, ${now}
				)
				returning id
			`;
			if (!conversation) throw new Error(`The conversation "${turn.title}" was not inserted.`);
			const input = {
				prompt: turn.prompt,
				conversationId: conversation.id,
				projectId: turn.projectId,
				...(turn.noteId ? { noteId: turn.noteId } : {})
			};
			await tx`
				insert into agent_runs (
					id, kind, user_id, conversation_id, model, execution_mode, status, started_at,
					input_snapshot, context_snapshot, created_at, updated_at
				) values (
					${turn.runId}, 'agent', ${turn.userId}, ${conversation.id}, ${turn.model},
					'approval_required', 'running', ${now}, ${tx.json(input)}, ${tx.json({})}, ${now}, ${now}
				)
			`;
			await tx`
				insert into messages (conversation_id, role, content, created_at)
				values (${conversation.id}, 'user', ${tx.json({ type: 'text', text: turn.prompt })}, ${now})
			`;
			const [queued] = await tx<{ cursor: string }[]>`
				insert into agent_run_events (run_id, attempt, event)
				values (
					${turn.runId}, 1,
					${tx.json({ type: 'run_queued', runId: turn.runId, reason: 'submitted', attempt: 1 })}
				)
				returning cursor
			`;
			if (!queued) throw new Error('The run_queued event was not inserted.');
			return {
				runId: turn.runId,
				conversationId: conversation.id,
				status: 'running',
				latestCursor: queued.cursor
			};
		});
	}

	/** Stream the turn from its start to its ending, performing each call as it is reached. */
	async play(turn: ScriptedTurn, receipt: ReplayReceipt): Promise<ReplayOutcome> {
		const run = this.writer(turn, receipt, 1);
		await run.event({ type: 'run_started', runId: turn.runId, attempt: 1 });
		if (turn.opening) await run.say(turn.opening);
		for (const call of turn.calls) await run.call(call);
		const ending = turn.ending;
		if (ending.kind === 'awaiting_approval') {
			const id = callId();
			await run.started(id, ending.call.name, ending.call.input);
			await sleep(this.pace.call);
			await run.pause(id, ending.call.name, ending.call.input);
			return { kind: 'parked', call: { callId: id, name: ending.call.name } };
		}
		if (ending.kind === 'answered') await run.say(ending.answer);
		await run.complete();
		return { kind: 'completed' };
	}

	/** Flip a parked run back to `running` before the stream resumes: what deciding does. */
	async approve(turn: ScriptedTurn): Promise<void> {
		await this.sql`
			update agent_runs
			set status = 'running', pending_decisions = '[]'::jsonb, updated_at = now()
			where id = ${turn.runId}
		`;
	}

	/** Continue a turn whose parked call the user approved: its result, the rest, the answer. */
	async resume(
		turn: ScriptedTurn,
		receipt: ReplayReceipt,
		parked: ParkedCall,
		resume: ScriptedResume
	): Promise<void> {
		const run = this.writer(turn, receipt, 2);
		await run.event({ type: 'run_queued', runId: turn.runId, reason: 'resumed', attempt: 2 });
		await run.event({ type: 'run_started', runId: turn.runId, attempt: 2 });
		await sleep(this.pace.call);
		await run.succeeded(parked.callId, parked.name, await resume.approved.perform());
		for (const call of resume.calls) await run.call(call);
		await run.say(resume.answer);
		await run.complete();
	}

	/** Store a workflow run for Extract promises, as the real request does, already running. */
	async startPromiseExtraction(input: {
		readonly userId: string;
		readonly model: string;
		readonly noteId: string;
		readonly selection: {
			readonly from: number;
			readonly to: number;
			readonly text: string;
			readonly revision: number;
		};
	}): Promise<ReplayReceipt> {
		const now = new Date();
		const runId = randomUUID();
		return this.sql.begin(async (tx) => {
			const [conversation] = await tx<{ id: string }[]>`
				insert into conversations (user_id, kind, context_note_id, title, created_at, updated_at)
				values (${input.userId}, 'workflow', ${input.noteId}, 'Extract promises', ${now}, ${now})
				returning id
			`;
			if (!conversation) throw new Error('The Extract promises conversation was not inserted.');
			const context = {
				kind: 'promise_extraction',
				generation: { kind: 'model', model: input.model },
				selection: { noteId: input.noteId, ...input.selection }
			};
			await tx`
				insert into agent_runs (
					id, kind, user_id, conversation_id, model, execution_mode, status, started_at,
					context_snapshot, definition_version, created_at, updated_at
				) values (
					${runId}, 'workflow', ${input.userId}, ${conversation.id}, ${input.model}, 'auto_accept',
					'running', ${now}, ${tx.json(context)}, 3, ${now}, ${now}
				)
			`;
			const [queued] = await tx<{ cursor: string }[]>`
				insert into agent_run_events (run_id, attempt, event)
				values (${runId}, 1, ${tx.json({ type: 'run_queued', runId, reason: 'submitted', attempt: 1 })})
				returning cursor
			`;
			if (!queued) throw new Error('The run_queued event was not inserted.');
			return {
				runId,
				conversationId: conversation.id,
				status: 'running',
				latestCursor: queued.cursor
			};
		});
	}

	/** Report the proposal the extraction found and finish the workflow run. */
	async finishPromiseExtraction(
		receipt: ReplayReceipt,
		userId: string,
		proposal: PromiseProposal
	): Promise<void> {
		const event = async (body: JsonObject): Promise<void> => {
			await this.sql`
				insert into agent_run_events (run_id, attempt, event)
				values (${receipt.runId}, 1, ${this.sql.json(body)})
			`;
		};
		await event({ type: 'run_started', runId: receipt.runId, attempt: 1 });
		await sleep(this.pace.call);
		const stamp = proposal.createdAt.toISOString();
		// The client reads `result` as the action's output: the proposals, and the todos that
		// were created without review (none in approval mode).
		await event({
			type: 'workflow_result',
			action: 'promises',
			result: {
				suggestions: [
					{
						id: proposal.suggestionId,
						userId,
						noteId: proposal.noteId,
						kind: 'todo',
						status: 'proposed',
						payload: proposal.payload,
						confidence: 1,
						provenanceId: proposal.provenanceId,
						sourceAnchorId: proposal.anchorId,
						isAutoAccepted: false,
						createdAt: stamp,
						updatedAt: stamp
					}
				],
				createdTodos: []
			}
		});
		await event({
			type: 'completed',
			runId: receipt.runId,
			conversationId: receipt.conversationId
		});
		await this.sql`
			update agent_runs set status = 'completed', finished_at = now(), updated_at = now()
			where id = ${receipt.runId}
		`;
	}

	private writer(turn: ScriptedTurn, receipt: ReplayReceipt, attempt: number) {
		const sql = this.sql;
		const pace = this.pace;
		const event = async (body: JsonObject): Promise<string> => {
			const [row] = await sql<{ cursor: string }[]>`
				insert into agent_run_events (run_id, attempt, event)
				values (${turn.runId}, ${attempt}, ${sql.json(body)})
				returning cursor
			`;
			if (!row) throw new Error('An agent run event was not inserted.');
			return row.cursor;
		};
		const message = async (
			role: 'assistant' | 'tool',
			content: JsonObject,
			cursor: string
		): Promise<void> => {
			await sql`
				insert into messages (conversation_id, run_id, event_cursor, role, content, model)
				values (
					${receipt.conversationId}, ${turn.runId}, ${cursor}, ${role}, ${sql.json(content)},
					${role === 'assistant' ? turn.model : null}
				)
			`;
		};
		const activity = (
			name: string,
			id: string,
			input: JsonObject,
			output: Json,
			status: 'running' | 'succeeded' | 'approval_required'
		): JsonObject => ({
			type: 'tool_activity',
			name,
			callId: id,
			input,
			output,
			status,
			failure: null
		});
		const say = async (text: string): Promise<void> => {
			let first: string | undefined;
			for (const chunk of deltas(text)) {
				const cursor = await event({ type: 'text_delta', text: chunk });
				first ??= cursor;
				await sleep(pace.delta);
			}
			if (first) await message('assistant', { type: 'text', text }, first);
		};
		const started = async (id: string, name: string, input: JsonObject): Promise<void> => {
			const cursor = await event({ type: 'tool_started', name, callId: id, arguments: input });
			await message('tool', activity(name, id, input, null, 'running'), cursor);
		};
		const succeeded = async (id: string, name: string, output: Json): Promise<void> => {
			const cursor = await event({ type: 'tool_succeeded', name, callId: id, output });
			await message('tool', activity(name, id, {}, output, 'succeeded'), cursor);
			// The real harness tells the client its workspace changed, which is how the note and
			// the todos appear in the other panes while the turn is still running.
			if (!READ_ONLY.test(name)) await event({ type: 'resources_stale', resources: ['workspace'] });
		};
		return {
			event,
			say,
			started,
			succeeded,
			call: async (call: ScriptedCall): Promise<void> => {
				const id = callId();
				const input = call.arguments();
				await started(id, call.name, input);
				await sleep(pace.call);
				await succeeded(id, call.name, await call.perform());
			},
			pause: async (id: string, name: string, input: JsonObject): Promise<void> => {
				const cursor = await event({
					type: 'approval_required',
					name,
					runId: turn.runId,
					callId: id,
					arguments: input
				});
				await message('tool', activity(name, id, input, null, 'approval_required'), cursor);
				await sql`
					update agent_runs
					set status = 'awaiting_approval',
						pending_decisions = ${sql.json([{ callId: id, toolName: name, arguments: input }])},
						updated_at = now()
					where id = ${turn.runId}
				`;
			},
			complete: async (): Promise<void> => {
				await event({
					type: 'completed',
					model: turn.model,
					runId: turn.runId,
					conversationId: receipt.conversationId
				});
				await sql`
					update agent_runs set status = 'completed', finished_at = now(), updated_at = now()
					where id = ${turn.runId}
				`;
				await sql`update conversations set updated_at = now() where id = ${receipt.conversationId}`;
			}
		};
	}
}
