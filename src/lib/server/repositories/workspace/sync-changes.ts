import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import { syncChangePageSize, type SyncCursor } from '$lib/models/sync';
import {
	workspaceJournalBatchSchema,
	type WorkspaceJournalSelection
} from '$lib/models/workspace-sync-reads';

export interface SyncChangesRepository {
	readSelection(actor: ActorContext, since: SyncCursor): Promise<WorkspaceJournalSelection>;
}

export class WorkspaceSyncChanges implements SyncChangesRepository {
	constructor(private readonly db: Database) {}
	async readSelection(actor: ActorContext, since: SyncCursor): Promise<WorkspaceJournalSelection> {
		const result = await this.db.execute(sql`
			with head as (select cursor from workspace_sync_heads where account_id = ${actor.userId}),
			page as (select c.* from workspace_sync_changes c, head h where c.account_id = ${actor.userId}
				and c.cursor > ${since}::bigint and c.cursor <= h.cursor order by c.cursor limit ${syncChangePageSize + 1}),
			selected as (select * from page order by cursor limit ${syncChangePageSize})
			select h.cursor::text as head, (select count(*) > ${syncChangePageSize} from page) as more,
				coalesce((select max(cursor) from selected), h.cursor)::text as checkpoint,
				coalesce((select jsonb_agg(jsonb_build_object('type', resource_type, 'id', resource_id,
					'operation', operation, 'version', version::text) order by cursor) from selected), '[]'::jsonb) as changes from head h`);
		const rows = z.array(workspaceJournalBatchSchema);
		const batch = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result)[0];
		if (!batch) throw new Error('The account has no synchronization head');
		return {
			head: batch.head,
			checkpoint: batch.checkpoint,
			hasMore: batch.more,
			changes: batch.changes.map(({ operation, version, ...identity }) => ({
				kind: operation,
				identity,
				version: BigInt(version)
			}))
		};
	}
}
