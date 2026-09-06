import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import { syncCursorSchema, syncEtag, type SyncCursor, type SyncChanges } from '$lib/models/sync';
import { workspaceResourceIdentitySchema, workspaceResourceKey } from '$lib/models/workspace-sync';

export interface SyncChangesRepository {
	pull(actor: ActorContext, since: SyncCursor): Promise<SyncChanges>;
}

const batchSchema = z.object({
	cursor: syncCursorSchema,
	changes: z.array(
		z.object({
			type: z.string(),
			id: z.array(z.string()),
			operation: z.enum(['upsert', 'delete']),
			version: z.string().regex(/^[1-9][0-9]*$/)
		})
	)
});

export class WorkspaceSyncChanges implements SyncChangesRepository {
	constructor(private readonly db: Database) {}

	async pull(actor: ActorContext, since: SyncCursor): Promise<SyncChanges> {
		// Head and compact journal share one statement snapshot. An uncommitted transaction
		// cannot appear in the head; later same-account transactions cannot overtake its lock.
		const result = await this.db.execute(sql`
			select h.cursor::text as cursor, coalesce((
				select jsonb_agg(jsonb_build_object('type', c.resource_type, 'id', c.resource_id,
					'operation', c.operation, 'version', c.version::text) order by c.cursor)
				from workspace_sync_changes c where c.account_id = h.account_id
					and c.cursor > ${since}::bigint and c.cursor <= h.cursor
			), '[]'::jsonb) as changes
			from workspace_sync_heads h where h.account_id = ${actor.userId}`);
		const rows = z.array(batchSchema);
		const batch = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result)[0];
		if (!batch) throw new Error('The account has no synchronization head');
		if (BigInt(since) > BigInt(batch.cursor))
			throw new Error('The client cursor is ahead of this account');
		return {
			cursor: batch.cursor,
			changes: batch.changes.map((change) => {
				const key = workspaceResourceKey(workspaceResourceIdentitySchema.parse(change));
				return change.operation === 'delete'
					? { kind: 'delete', key }
					: { kind: 'upsert', key, etag: syncEtag(BigInt(change.version)) };
			})
		};
	}
}
