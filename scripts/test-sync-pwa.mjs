import { GenericContainer, Wait } from 'testcontainers';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { spawn } from 'node:child_process';
const container = await new GenericContainer('pgvector/pgvector:pg17')
	.withEnvironment({ POSTGRES_DB: 'sync_pwa', POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test' })
	.withExposedPorts(5432)
	.withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
	.start();
const databaseUrl = `postgres://test:test@${container.getHost()}:${container.getMappedPort(5432)}/sync_pwa`;
const sql = postgres(databaseUrl, { max: 1 });
try {
	await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
	const userId = '00000000-0000-4000-8000-000000000001';
	const projectId = '00000000-0000-4000-8000-000000000002';
	const noteId = '00000000-0000-4000-8000-000000000003';
	await sql`insert into users (id, email, display_name, role) values (${userId}, 'sync-pwa@local.invalid', 'Sync tester', 'USER')`;
	await sql`insert into projects (id, user_id, name, role) values (${projectId}, ${userId}, 'Inbox', 'inbox')`;
	await sql`insert into notes (id, user_id, project_id, kind, title, document, plain_text) values (${noteId}, ${userId}, ${projectId}, 'note', 'Offline synchronization test', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Retained on this device"}]}]}'::jsonb, 'Retained on this device')`;
	const conversationId = '00000000-0000-4000-8000-000000000004';
	await sql`insert into conversations (id, user_id, title) values (${conversationId}, ${userId}, 'Saved synchronization chat')`;
	await sql`insert into messages (id, conversation_id, role, content) values ('00000000-0000-4000-8000-000000000005', ${conversationId}, 'user', '{"type":"text","text":"Retained chat question"}'::jsonb)`;
	const diagramId = '00000000-0000-4000-8000-000000000006';
	await sql`insert into diagrams (id, user_id, project_id, kind, title, source, rendered_svg) values (${diagramId}, ${userId}, ${projectId}, 'drawio', 'Saved synchronization diagram', '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 100"><rect x="20" y="20" width="200" height="60" fill="#eef2ff" stroke="#4f46e5"/><text x="120" y="55" text-anchor="middle" fill="#111827">Saved diagram</text></svg>')`;
	const skillId = '00000000-0000-4000-8000-000000000007';
	await sql`insert into notes (id, user_id, project_id, kind, title, document, plain_text) values (${skillId}, ${userId}, ${projectId}, 'skill', 'Saved synchronization skill', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Write clearly"}]}]}'::jsonb, 'Write clearly')`;
	await sql`insert into skills (note_id, name, slug, description) values (${skillId}, 'Saved synchronization skill', 'saved-sync-skill', 'Use clear language')`;

	const child = spawn(
		'pnpm',
		['exec', 'playwright', 'test', '-c', 'playwright.pwa.config.ts', '--max-failures=1'],
		{
			stdio: 'inherit',
			env: {
				...process.env,
				CI: '1',
				CONFIG_SOURCE: 'env',
				DATABASE_URL: databaseUrl,
				LOCAL_USER_ID: userId
			}
		}
	);
	process.exitCode = await new Promise((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', (code) => resolve(code ?? 1));
	});
} finally {
	await sql.end();
	await container.stop();
}
