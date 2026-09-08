import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ActorContext } from '$lib/models/identity';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import {
	workspaceWriteReceiptSchema,
	type WorkspaceWriteReceipt
} from '$lib/models/workspace-records';
import type { Database } from '$lib/server/db';
import { syncIdentitySql, syncRegistrations } from './sync-catalog';

export type ReceiptLookup =
	| { readonly kind: 'missing' }
	| { readonly kind: 'reused' }
	| { readonly kind: 'receipt'; readonly receipt: WorkspaceWriteReceipt };

export interface SyncReceiptRepository {
	lock(
		actor: ActorContext,
		operationId: string,
		identity: WorkspaceResourceIdentity
	): Promise<void>;
	find(actor: ActorContext, operationId: string, request: string): Promise<ReceiptLookup>;
	save(actor: ActorContext, request: string, receipt: WorkspaceWriteReceipt): Promise<void>;
}

// JSONB canonicalizes object key order. The exact parsed request is checked on retries,
// including its base version; an operation ID cannot silently authorize different input.
const requestHash = (request: string) =>
	sql`encode(sha256(convert_to(${request}::jsonb::text, 'UTF8')), 'hex')`;

/** All methods participate in the caller's existing domain transaction. */
export class WorkspaceSyncReceipts implements SyncReceiptRepository {
	constructor(private readonly db: Database) {}

	async lock(
		actor: ActorContext,
		operationId: string,
		identity: WorkspaceResourceIdentity
	): Promise<void> {
		await this.db.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${'operation:' + operationId}))`
		);
		await this.db.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${'resource:' + workspaceResourceKey(identity)}))`
		);
		const registration = syncRegistrations.find((item) => item.type === identity.type);
		if (!registration) throw new Error(`No synchronization registration for ${identity.type}`);
		// Lock the source row, not just its metadata: domain writers also lock that row.
		// The resource advisory lock covers the absent-row case for offline creations.
		await this.db.execute(sql`select 1 from ${sql.identifier(identity.type)} r
			where ${registration.scope(actor)} and ${syncIdentitySql(registration)} = ${JSON.stringify(identity.id)}::jsonb
			for update`);
	}

	async find(actor: ActorContext, operationId: string, request: string): Promise<ReceiptLookup> {
		const result = await this.db
			.execute(sql`select request_hash = ${requestHash(request)} as matches, result
			from workspace_sync_receipts where account_id = ${actor.userId} and operation_id = ${operationId}`);
		const rows = z.array(
			z.discriminatedUnion('matches', [
				z.object({ matches: z.literal(true), result: workspaceWriteReceiptSchema }),
				z.object({ matches: z.literal(false) })
			])
		);
		const row = z
			.union([rows, z.object({ rows })])
			.transform((value) => (Array.isArray(value) ? value : value.rows))
			.parse(result)[0];
		return !row
			? { kind: 'missing' }
			: !row.matches
				? { kind: 'reused' }
				: { kind: 'receipt', receipt: row.result };
	}

	async save(actor: ActorContext, request: string, receipt: WorkspaceWriteReceipt): Promise<void> {
		await this.db
			.execute(sql`insert into workspace_sync_receipts (account_id, operation_id, request_hash, result)
			values (${actor.userId}, ${receipt.operationId}, ${requestHash(request)}, ${JSON.stringify(receipt)}::jsonb)`);
	}
}
