import { sql } from 'drizzle-orm';
import { WorkspaceSyncObjects } from './sync-objects';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { SyncPage } from '$lib/models/sync';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import { syncCursorSchema, syncEtag, type SyncCursor } from '$lib/models/sync';
import { workspaceResourceIdentitySchema, workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncChangePageSize, type SyncChangePage } from '$lib/models/sync';

export interface SyncChangesRepository {
	pullPage(actor: ActorContext, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>>;
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
	async pullPage(actor: ActorContext, since: SyncCursor): Promise<SyncPage<WorkspaceRecord>> {
		return this.db.transaction(
			async (transaction) => {
				const page = await new WorkspaceSyncChanges(transaction).readPage(actor, since);
				const objects = new WorkspaceSyncObjects(transaction);
				const records: SyncPage<WorkspaceRecord>['records'][number][] = [];
				for (const change of page.changes) {
					if (change.kind === 'delete') {
						records.push({ key: change.key, resource: { kind: 'deleted', etag: change.etag } });
						continue;
					}
					const [type, ...id] = z.array(z.string()).parse(JSON.parse(change.key));
					const identity = workspaceResourceIdentitySchema.parse({ type, id });
					const resource = await objects.read(actor, identity, null);
					if (resource.kind !== 'found' || resource.snapshot.etag !== change.etag)
						throw new Error('The synchronization journal does not match its resource');
					records.push({ key: change.key, resource });
				}
				return { cursor: page.cursor, hasMore: page.hasMore, records };
			},
			{ isolationLevel: 'repeatable read', accessMode: 'read only' }
		);
	}
	private async readPage(actor: ActorContext, since: SyncCursor): Promise<SyncChangePage> {
		const result = await this.db.execute(sql`
			with head as (select cursor from workspace_sync_heads where account_id = ${actor.userId}),
			page as (select c.* from workspace_sync_changes c, head h where c.account_id = ${actor.userId}
				and c.cursor > ${since}::bigint and c.cursor <= h.cursor order by c.cursor limit ${syncChangePageSize + 1}),
			selected as (select * from page order by cursor limit ${syncChangePageSize})
			select h.cursor::text as head, (select count(*) > ${syncChangePageSize} from page) as more,
				coalesce((select max(cursor) from selected), h.cursor)::text as checkpoint,
				coalesce((select jsonb_agg(jsonb_build_object('type', resource_type, 'id', resource_id,
					'operation', operation, 'version', version::text) order by cursor) from selected), '[]'::jsonb) as changes from head h`);
		const rows = z.array(
			batchSchema
				.omit({ cursor: true })
				.extend({ head: syncCursorSchema, more: z.boolean(), checkpoint: syncCursorSchema })
		);
		const batch = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result)[0];
		if (!batch) throw new Error('The account has no synchronization head');
		if (BigInt(since) > BigInt(batch.head))
			throw new Error('The client cursor is ahead of this account');
		return {
			cursor: batch.more ? batch.checkpoint : batch.head,
			hasMore: batch.more,
			changes: batch.changes.map((change) => ({
				kind: change.operation === 'delete' ? ('delete' as const) : ('upsert' as const),
				key: workspaceResourceKey(workspaceResourceIdentitySchema.parse(change)),
				etag: syncEtag(BigInt(change.version))
			}))
		};
	}
}
