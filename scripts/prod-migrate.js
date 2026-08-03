/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
import { spawnSync } from 'node:child_process';
import { InfisicalSDK } from '@infisical/sdk';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { provisionDatabase } from './provision-db.js';
import { initTelemetry, shutdownTelemetry } from './otel-instrumentation.js';

async function run() {
	// Initialize OpenTelemetry
	initTelemetry('followthrough-migrate');

	console.log('Starting migration script...');

	// Step 1: Provision database if needed
	console.log('Step 1: Provisioning database...');
	let provisioned;
	try {
		provisioned = await provisionDatabase();
		console.log('Database provisioning completed.');
	} catch (err) {
		console.error('Database provisioning failed:', err);
		await shutdownTelemetry();
		process.exit(1);
	}

	// Step 2: Fetch Secrets from Infisical
	console.log('Step 2: Fetching secrets from Infisical...');
	const clientId = process.env.INFISICAL_CLIENT_ID;
	const clientSecret = process.env.INFISICAL_CLIENT_SECRET;
	const projectId = process.env.INFISICAL_PROJECT_ID;

	if (!clientId || !clientSecret || !projectId) {
		console.error('Missing Infisical credentials (CLIENT_ID, CLIENT_SECRET, PROJECT_ID)');
		await shutdownTelemetry();
		process.exit(1);
	}

	const client = new InfisicalSDK({ siteUrl: process.env.INFISICAL_URL });
	await client.auth().universalAuth.login({ clientId, clientSecret });
	const secrets = await client.secrets().listSecrets({
		environment: process.env.INFISICAL_ENVIRONMENT || 'prod',
		projectId,
		includeImports: true
	});

	const secretMap = {};
	secrets.secrets.forEach((s) => (secretMap[s.secretKey] = s.secretValue));

	console.log('Step 3: Connecting to database...');
	const connectionString =
		secretMap['DATABASE_URL'] || provisioned.databaseUrl || process.env.DATABASE_URL;

	if (!connectionString) {
		console.error('DATABASE_URL not found in secrets or environment');
		await shutdownTelemetry();
		process.exit(1);
	}

	const sql = postgres(connectionString, { max: 1 });

	// Step 4: Run Migrations
	try {
		console.log('Running migrations from ./drizzle folder...');
		await migrate(drizzle(sql), { migrationsFolder: './drizzle' });
		console.log('Migrations completed successfully.');
	} catch (err) {
		console.error('Migration failed:', err);
		await sql.end();
		await shutdownTelemetry();
		process.exit(1);
	}
	await sql.end();

	// Step 5: Seed tool embeddings into the freshly migrated schema. Runs as a
	// child process against the worker bundle (the runtime image ships no src/),
	// with the Infisical-resolved secrets on its environment.
	console.log('Step 5: Seeding tool embeddings...');
	const seed = spawnSync('node', ['build-worker/seed-tool-embeddings.js'], {
		stdio: 'inherit',
		env: { ...process.env, ...secretMap, DATABASE_URL: connectionString }
	});
	if (seed.status !== 0) {
		console.error('Tool embedding seed failed with status:', seed.status);
		await shutdownTelemetry();
		process.exit(1);
	}

	// Shutdown telemetry before exiting
	await shutdownTelemetry();
}

run();
