import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';

export type Json =
	string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };

/** One tool call that succeeded, as the agent harness journals it. */
export interface JournalledCall {
	readonly name: string;
	readonly input: JsonObject;
	readonly output: Json;
}

/** One finished agent turn: the prompt, what it called, and what it said around the calls. */
export interface JournalledRun {
	readonly userId: string;
	readonly projectId: string;
	/** The note the chat was opened from, when it was opened from one. */
	readonly noteId: string | null;
	readonly title: string;
	readonly prompt: string;
	readonly startedAt: Date;
	readonly model: string;
	/** Text before the calls, and the answer after them. A turn that only reads has neither. */
	readonly speech: { readonly opening: string; readonly answer: string } | null;
	readonly calls: readonly JournalledCall[];
}

const callId = (): string => `call_${randomBytes(12).toString('hex')}`;

/**
 * Store a completed run the way the run writer does: an event log, a `running` row at each
 * `tool_started`, a `succeeded` row at each `tool_succeeded`, and one assistant row per
 * contiguous run of text, keyed by the cursor of the event it began at. The transcript and
 * the Agent activity page both read these rows, so a seeded turn is indistinguishable from a
 * real one without calling a model.
 */
export const journalRun = async (sql: Sql, turn: JournalledRun): Promise<void> => {
	await sql.begin(async (tx) => {
		const [conversation] = await tx<{ id: string }[]>`
			insert into conversations (
				user_id, kind, context_project_id, context_note_id, title, created_at, updated_at
			) values (
				${turn.userId}, 'chat', ${turn.projectId}, ${turn.noteId}, ${turn.title},
				${turn.startedAt}, ${turn.startedAt}
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
		// A transaction answers one `now()`. Transcripts are ordered by `created_at`, so each row
		// is stamped a second after the one before it, as a real run spreads them out.
		let sequence = 0;
		const stamp = (): Date => new Date(turn.startedAt.getTime() + (sequence += 1) * 1000);
		const [run] = await tx<{ id: string }[]>`
			insert into agent_runs (
				kind, user_id, conversation_id, model, execution_mode, status,
				started_at, finished_at, input_snapshot, context_snapshot, created_at, updated_at
			) values (
				'agent', ${turn.userId}, ${conversation.id}, ${turn.model}, 'approval_required',
				'completed', ${turn.startedAt},
				${new Date(turn.startedAt.getTime() + (turn.calls.length * 2 + 6) * 1000)},
				${tx.json(input)}, ${tx.json({})}, ${turn.startedAt}, ${turn.startedAt}
			)
			returning id
		`;
		if (!run) throw new Error(`The run for "${turn.title}" was not inserted.`);
		const event = async (body: JsonObject): Promise<string> => {
			const [row] = await tx<{ cursor: string }[]>`
				insert into agent_run_events (run_id, attempt, event, created_at)
				values (${run.id}, 1, ${tx.json(body)}, ${stamp()})
				returning cursor
			`;
			if (!row) throw new Error('An agent run event was not inserted.');
			return row.cursor;
		};
		const message = async (
			role: 'user' | 'assistant' | 'tool',
			content: JsonObject,
			cursor: string | null
		): Promise<void> => {
			await tx`
				insert into messages (
					conversation_id, run_id, event_cursor, role, content, model, created_at
				) values (
					${conversation.id}, ${role === 'user' ? null : run.id}, ${cursor}, ${role},
					${tx.json(content)}, ${role === 'assistant' ? turn.model : null}, ${stamp()}
				)
			`;
		};
		const say = async (text: string): Promise<void> => {
			const cursor = await event({ type: 'text_delta', text });
			await message('assistant', { type: 'text', text }, cursor);
		};

		await message('user', { type: 'text', text: turn.prompt }, null);
		await event({ type: 'run_queued', runId: run.id, reason: 'submitted', attempt: 1 });
		await event({ type: 'run_started', runId: run.id, attempt: 1 });
		if (turn.speech) await say(turn.speech.opening);
		const calls = turn.calls.map((call) => ({ ...call, callId: callId() }));
		for (const call of calls) {
			const cursor = await event({
				type: 'tool_started',
				name: call.name,
				callId: call.callId,
				arguments: call.input
			});
			await message(
				'tool',
				{
					type: 'tool_activity',
					name: call.name,
					callId: call.callId,
					input: call.input,
					output: null,
					status: 'running',
					failure: null
				},
				cursor
			);
		}
		for (const call of calls) {
			const cursor = await event({
				type: 'tool_succeeded',
				name: call.name,
				callId: call.callId,
				output: call.output
			});
			await message(
				'tool',
				{
					type: 'tool_activity',
					name: call.name,
					callId: call.callId,
					input: {},
					output: call.output,
					status: 'succeeded',
					failure: null
				},
				cursor
			);
		}
		if (turn.speech) await say(turn.speech.answer);
		await event({
			type: 'completed',
			model: turn.model,
			runId: run.id,
			conversationId: conversation.id
		});
		await tx`update conversations set updated_at = ${stamp()} where id = ${conversation.id}`;
	});
};
