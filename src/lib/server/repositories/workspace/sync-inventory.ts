import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '$lib/server/db';
import type { ActorContext } from '$lib/models/identity';
import { syncEtag, type InventoryEntry } from '$lib/models/sync';
import { workspaceResourceIdentitySchema, workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncIdentitySql, syncRegistrations } from './sync-catalog';

export interface SyncInventoryRepository {
	list(actor: ActorContext): Promise<readonly InventoryEntry[]>;
}

const inventoryRowSchema = z.object({
	type: z.string(),
	id: z.array(z.string()),
	version: z.string().regex(/^[1-9][0-9]*$/)
});

export class WorkspaceSyncInventory implements SyncInventoryRepository {
	constructor(private readonly db: Database) {}

	async list(actor: ActorContext): Promise<readonly InventoryEntry[]> {
		// A single statement gives the complete inventory one PostgreSQL snapshot. Left joining
		// makes a missing version fail parsing rather than silently hiding the underlying record.
		const rows = await this.db.execute(
			sql.join(
				syncRegistrations.map(
					(registration) => sql`
			select ${registration.type}::text as type, ${syncIdentitySql(registration)} as id,
				v.version::text as version
			from ${sql.identifier(registration.type)} r
			left join workspace_sync_versions v on v.resource_type = ${registration.type}
				and v.resource_id = ${syncIdentitySql(registration)}
			where ${registration.scope(actor)}`
				),
				sql` union all `
			)
		);
		return z
			.union([z.array(inventoryRowSchema), z.object({ rows: z.array(inventoryRowSchema) })])
			.transform((result) => (Array.isArray(result) ? result : result.rows))
			.parse(rows)
			.map((row) => ({
				key: workspaceResourceKey(workspaceResourceIdentitySchema.parse(row)),
				etag: syncEtag(BigInt(row.version))
			}));
	}
}
