import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateTodoBatchInput,
	CreateTodoBatchOutput,
	TodoBatchLookup
} from '$lib/models/todos';
import { todoRecordSchema } from '$lib/models/workspace-records';
import type { TodoBatchReceiptRepository } from '$lib/server/repositories/todos/batch-receipts';
import type { Database } from '$lib/server/db';

const rows = z.array(
	z.discriminatedUnion('matches', [
		z.object({ matches: z.literal(false) }),
		z.object({ matches: z.literal(true), result: z.object({ todos: z.array(todoRecordSchema) }) })
	])
);

export class TodoBatchReceiptRecords implements TodoBatchReceiptRepository {
	constructor(private readonly db: Database) {}
	async lock(actor: ActorContext, requestId: string): Promise<void> {
		await this.db.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${'todo-batch:' + requestId}))`
		);
	}
	async find(actor: ActorContext, input: CreateTodoBatchInput): Promise<TodoBatchLookup> {
		const result = await this.db.execute(
			sql`select request = ${JSON.stringify(input)}::jsonb as matches, result from todo_batch_receipts where user_id = ${actor.userId} and request_id = ${input.requestId}`
		);
		const row = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result)[0];
		return !row
			? { kind: 'missing' }
			: !row.matches
				? { kind: 'reused' }
				: { kind: 'saved', result: row.result };
	}
	async save(
		actor: ActorContext,
		input: CreateTodoBatchInput,
		result: CreateTodoBatchOutput
	): Promise<void> {
		await this.db.execute(
			sql`insert into todo_batch_receipts (user_id, request_id, request, result) values (${actor.userId}, ${input.requestId}, ${JSON.stringify(input)}::jsonb, ${JSON.stringify(result)}::jsonb)`
		);
	}
}
