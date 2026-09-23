import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { appliedWriteProofSchema, type AppliedWriteProof } from '$lib/models/outbox';
import type { ActorContext } from '$lib/models/identity';
import { workspaceResourceKey, type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { type WorkspaceWriteReceipt } from '$lib/models/workspace-records';
import type { Database } from '$lib/server/db';
import { syncIdentityPredicate, syncRegistrations, syncOwnerSql } from './sync-catalog';

export type ReceiptLookup =
	| { readonly kind: 'missing' }
	| { readonly kind: 'reused' }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'proven'; readonly proof: AppliedWriteProof };

export interface SyncReceiptRepository {
	publishChanges(): Promise<void>;
	lockOperation(actor: ActorContext, operationId: string): Promise<void>;
	cancel(actor: ActorContext, operationId: string, request: string): Promise<void>;
	lockResource(actor: ActorContext, identity: WorkspaceResourceIdentity): Promise<void>;
	find(actor: ActorContext, operationId: string, request: string): Promise<ReceiptLookup>;
	save(actor: ActorContext, request: string, receipt: WorkspaceWriteReceipt): Promise<void>;
}

// JSONB canonicalizes object key order. The exact parsed request is checked on retries,
// including its base version; an operation ID cannot silently authorize different input.
const requestHash = (request: string) =>
	sql`encode(sha256(convert_to(${request}::jsonb::text, 'UTF8')), 'hex')`;

/** Mutation locks and receipt creation participate in the domain transaction. */
export class WorkspaceSyncReceipts implements SyncReceiptRepository {
	constructor(private readonly db: Database) {}
	async publishChanges(): Promise<void> {
		// Domain writes are finished. Publish now so deletion receipts can read their
		// authoritative tombstone, while retaining the domain-row-before-head lock order.
		await this.db.execute(sql`SET CONSTRAINTS workspace_sync_journal IMMEDIATE`);
		await this.db.execute(sql`SET CONSTRAINTS workspace_sync_journal DEFERRED`);
	}
	async lockOperation(actor: ActorContext, operationId: string): Promise<void> {
		await this.db.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${'operation:' + operationId}))`
		);
	}
	async cancel(actor: ActorContext, operationId: string, request: string): Promise<void> {
		await this.db
			.execute(sql`insert into workspace_sync_receipts (account_id, operation_id, request_hash, disposition, result)
			values (${actor.userId}, ${operationId}, ${requestHash(request)}, 'cancelled', null)`);
	}

	async lockResource(actor: ActorContext, identity: WorkspaceResourceIdentity): Promise<void> {
		await this.db.execute(
			sql`select pg_advisory_xact_lock(hashtext(${actor.userId}), hashtext(${'resource:' + workspaceResourceKey(identity)}))`
		);
		const registration = syncRegistrations.find((item) => item.type === identity.type);
		if (!registration) throw new Error(`No synchronization registration for ${identity.type}`);
		// Skill metadata and its title trigger share the note-before-metadata order with domain edits.
		if (identity.type === 'skills')
			await this.db.execute(sql`select 1 from notes
				where id = ${identity.id[0]} and user_id = ${actor.userId} for update`);
		// Lock the source row, not just its metadata: domain writers also lock that row.
		// The resource advisory lock covers the absent-row case for offline creations.
		await this.db.execute(sql`select 1 from ${sql.identifier(identity.type)} r
			where ${syncOwnerSql(registration.type, actor)} and ${syncIdentityPredicate(registration, identity.id)}
			for update`);
	}

	async find(actor: ActorContext, operationId: string, request: string): Promise<ReceiptLookup> {
		const result = await this.db
			.execute(sql`select request_hash = ${requestHash(request)} as matches, disposition, result
			from workspace_sync_receipts where account_id = ${actor.userId} and operation_id = ${operationId}`);
		const rows = z.array(
			z.union([
				z
					.object({ matches: z.literal(true) })
					.and(
						z.discriminatedUnion('disposition', [
							z.object({ disposition: z.literal('applied'), result: appliedWriteProofSchema }),
							z.object({ disposition: z.literal('cancelled'), result: z.null() })
						])
					),
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
				: row.disposition === 'cancelled'
					? { kind: 'cancelled' }
					: { kind: 'proven', proof: row.result };
	}

	async save(actor: ActorContext, request: string, receipt: WorkspaceWriteReceipt): Promise<void> {
		const resource = receipt.resource;
		const proof: AppliedWriteProof = {
			operationId: receipt.operationId,
			resourceKind: resource.kind,
			etag: resource.kind === 'found' ? resource.snapshot.etag : resource.etag
		};
		await this.db
			.execute(sql`insert into workspace_sync_receipts (account_id, operation_id, request_hash, result)
			values (${actor.userId}, ${receipt.operationId}, ${requestHash(request)}, ${JSON.stringify(proof)}::jsonb)`);
	}
}
