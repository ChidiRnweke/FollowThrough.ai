import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

/** The base installer, then each later resource's triggers, in migration order. */
const installers = ['0051_workspace_sync_changes.sql', '0060_widgets_workspace_sync.sql'] as const;

/** Install SQL objects that schema push cannot represent, without editing migration history. */
export async function installWorkspaceSync(client: postgres.Sql): Promise<void> {
	const installations = await Promise.all(
		installers.map((file) => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'))
	);
	await client.begin(async (transaction) => {
		for (const installation of installations) await transaction.unsafe(installation);
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
