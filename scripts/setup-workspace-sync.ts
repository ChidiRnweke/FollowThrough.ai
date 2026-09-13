import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

/** Install SQL objects that schema push cannot represent, without editing migration history. */
export async function installWorkspaceSync(client: postgres.Sql): Promise<void> {
	const versionSql = await readFile(
		new URL('../drizzle/0050_workspace_sync_versions.sql', import.meta.url),
		'utf8'
	);
	const journalSql = await readFile(
		new URL('../drizzle/0051_workspace_sync_changes.sql', import.meta.url),
		'utf8'
	);
	const statements = journalSql.split('--> statement-breakpoint');
	const functions = statements.filter((statement) =>
		/CREATE (OR REPLACE )?FUNCTION/.test(statement)
	);
	const registration = versionSql
		.split('--> statement-breakpoint')
		.find((statement) => statement.includes('FOR registration IN'));
	if (!registration || functions.length !== 4)
		throw new Error('Synchronization migration layout changed; review the setup script');
	const install = registration
		.replaceAll('CREATE TRIGGER', 'CREATE OR REPLACE TRIGGER')
		.replace(
			'workspace_sync_versions (resource_type, resource_id)',
			'workspace_sync_versions (resource_type, resource_id, account_id)'
		)
		.replace(
			"SELECT %L, %s FROM %I', registration.table_name, identity_sql, registration.table_name",
			"SELECT %L, %s, workspace_sync_account(%L, to_jsonb(r)) FROM %I r ON CONFLICT (resource_type, resource_id) DO NOTHING', registration.table_name, identity_sql, registration.table_name, registration.table_name"
		);
	await client.begin(async (transaction) => {
		await transaction`select pg_advisory_xact_lock(hashtextextended('workspace-sync-setup', 0))`;
		// The schema, including receipt constraints, must already have been pushed.
		await transaction`select account_id, disposition, result from workspace_sync_receipts limit 0`;
		for (const statement of functions)
			await transaction.unsafe(
				statement.replace(/CREATE (?:OR REPLACE )?FUNCTION/, 'CREATE OR REPLACE FUNCTION')
			);
		await transaction.unsafe(
			'DROP TRIGGER IF EXISTS workspace_sync_journal ON workspace_sync_versions'
		);
		await transaction.unsafe(
			'CREATE CONSTRAINT TRIGGER workspace_sync_journal AFTER INSERT OR UPDATE OR DELETE ON workspace_sync_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_workspace_sync_version()'
		);
		await transaction.unsafe(install);
		await transaction.unsafe('SET CONSTRAINTS workspace_sync_journal IMMEDIATE');
		// Only absent journal rows need seeding. Existing checkpoints and deletion evidence survive.
		await transaction.unsafe(`DO $$ DECLARE resource record; BEGIN
   FOR resource IN SELECT v.* FROM workspace_sync_versions v WHERE NOT EXISTS
    (SELECT 1 FROM workspace_sync_changes c WHERE c.account_id = v.account_id AND c.resource_type = v.resource_type AND c.resource_id = v.resource_id)
    ORDER BY account_id, resource_type, resource_id LOOP
    PERFORM record_workspace_sync_change(resource.account_id, resource.resource_type, resource.resource_id, 'upsert', resource.version);
   END LOOP;
  END $$;`);
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const url = process.env.DATABASE_URL;
	if (!url)
		throw new Error('DATABASE_URL is required. Use the same development database as db:push.');
	const client = postgres(url, { max: 1 });
	try {
		await installWorkspaceSync(client);
		console.log('Workspace sync functions, triggers, and initial inventory are ready.');
	} finally {
		await client.end();
	}
}
