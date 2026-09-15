import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import type { Sql } from 'postgres';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { AttachmentVersionId } from '$lib/models/attachments';
import type { AttachmentClaim, AttachmentClaims } from '../claims';
const claimRow = z.object({ owned: z.boolean(), pid: z.number().int() });
const backendRow = z.object({ pid: z.number().int() });
interface ConnectionScope {
	database: Database;
	run<T>(database: Database, work: () => Promise<T>): Promise<T>;
}
/** The dedicated single-connection session owns both the session lock and every completion transaction. */
export class PostgresAttachmentClaims implements AttachmentClaims {
	constructor(
		private readonly connections: { open(): Sql },
		private readonly scope: ConnectionScope
	) {}
	async withClaim<T>(
		versionId: AttachmentVersionId,
		work: (claim: AttachmentClaim) => Promise<T>
	): Promise<{ kind: 'claimed'; value: T } | { kind: 'busy' }> {
		const connection = this.connections.open();
		try {
			const acquired = claimRow.parse(
				(
					await connection`select pg_try_advisory_lock(hashtextextended(${versionId}, 71341)) as owned, pg_backend_pid() as pid`
				)[0]
			);
			if (!acquired.owned) return { kind: 'busy' };
			const value = await this.scope.run(drizzle(connection, { schema }), () =>
				work({
					assertOwned: async () => {
						const current = z
							.array(backendRow)
							.nonempty()
							.parse(await this.scope.database.execute(sql`select pg_backend_pid() as pid`))[0];
						if (current.pid !== acquired.pid)
							throw new Error('Attachment processing connection lost its claim');
					}
				})
			);
			return { kind: 'claimed', value };
		} finally {
			await connection.end();
		}
	}
}
