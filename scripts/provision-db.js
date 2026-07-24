/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { InfisicalSDK } from '@infisical/sdk';
import { APPLICATION_DEFAULTS } from './config-service.js';

const required = (environment, key) => {
	const value = environment[key]?.trim();
	if (!value) throw new Error(`${key} is required`);
	return value;
};

export const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

function isConfirmedMissing(error) {
	return (
		error?.statusCode === 404 ||
		error?.response?.status === 404 ||
		error?.response?.statusCode === 404
	);
}

async function getOptionalSecret(client, secretName, options) {
	try {
		return (await client.secrets().getSecret({ ...options, secretName })).secretValue;
	} catch (error) {
		if (isConfirmedMissing(error)) return undefined;
		throw error;
	}
}

async function upsertSecret(client, secretName, secretValue, options) {
	try {
		await client.secrets().updateSecret(secretName, { ...options, secretValue });
	} catch (error) {
		if (!isConfirmedMissing(error)) throw error;
		await client.secrets().createSecret(secretName, { ...options, secretValue });
	}
}

export function buildDatabaseUrl({ user, password, host, port, database }) {
	return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

export function resolveDatabaseIdentity({ dbName, dbUser }) {
	return {
		dbName: dbName?.trim() || APPLICATION_DEFAULTS.DB_NAME,
		dbUser: dbUser?.trim() || APPLICATION_DEFAULTS.DB_USER
	};
}

export async function provisionDatabase({
	environment = process.env,
	appClient,
	adminClient,
	postgresClient = postgres,
	passwordFactory = () => randomBytes(32).toString('base64url')
} = {}) {
	const siteUrl = required(environment, 'INFISICAL_URL');
	const appProjectId = required(environment, 'INFISICAL_PROJECT_ID');
	const infisicalEnvironment = required(environment, 'INFISICAL_ENVIRONMENT');
	const appOptions = {
		projectId: appProjectId,
		environment: infisicalEnvironment,
		secretPath: '/',
		type: 'shared'
	};

	appClient ??= new InfisicalSDK({ siteUrl });
	await appClient.auth().universalAuth.login({
		clientId: required(environment, 'INFISICAL_CLIENT_ID'),
		clientSecret: required(environment, 'INFISICAL_CLIENT_SECRET')
	});

	if (await getOptionalSecret(appClient, 'DATABASE_URL', appOptions)) return { created: false };
	const { dbName, dbUser } = resolveDatabaseIdentity({
		dbName: await getOptionalSecret(appClient, 'DB_NAME', appOptions),
		dbUser: await getOptionalSecret(appClient, 'DB_USER', appOptions)
	});

	adminClient ??= new InfisicalSDK({ siteUrl });
	await adminClient.auth().universalAuth.login({
		clientId: required(environment, 'INFISICAL_ADMIN_CLIENT_ID'),
		clientSecret: required(environment, 'INFISICAL_ADMIN_CLIENT_SECRET')
	});
	const adminOptions = {
		projectId: required(environment, 'INFISICAL_ADMIN_PROJECT_ID'),
		environment: infisicalEnvironment,
		secretPath: '/',
		type: 'shared'
	};
	const adminUser = await getOptionalSecret(adminClient, 'POSTGRES_ADMIN_USER', adminOptions);
	const adminPassword = await getOptionalSecret(
		adminClient,
		'POSTGRES_ADMIN_PASSWORD',
		adminOptions
	);
	const host = await getOptionalSecret(adminClient, 'POSTGRES_HOST', adminOptions);
	const port = await getOptionalSecret(adminClient, 'POSTGRES_PORT', adminOptions);
	if (!adminUser || !adminPassword || !host || !port)
		throw new Error('Admin Infisical project is missing PostgreSQL connection configuration');

	const adminUrl = buildDatabaseUrl({
		user: adminUser,
		password: adminPassword,
		host,
		port,
		database: 'postgres'
	});
	const sql = postgresClient(adminUrl, { max: 1 });
	const rolePassword = passwordFactory();
	const role = quoteIdentifier(dbUser);
	const database = quoteIdentifier(dbName);
	try {
		const databaseExists =
			(await sql`select 1 from pg_database where datname = ${dbName}`).length > 0;
		if (!databaseExists) await sql.unsafe(`CREATE DATABASE ${database}`);
		const roleExists = (await sql`select 1 from pg_roles where rolname = ${dbUser}`).length > 0;
		if (roleExists) await sql.unsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD $1`, [rolePassword]);
		else await sql.unsafe(`CREATE ROLE ${role} WITH LOGIN PASSWORD $1`, [rolePassword]);
		await sql.unsafe(`ALTER DATABASE ${database} OWNER TO ${role}`);
	} finally {
		await sql.end();
	}

	const databaseUrl = buildDatabaseUrl({
		user: dbUser,
		password: rolePassword,
		host,
		port,
		database: dbName
	});
	const databaseSql = postgresClient(databaseUrl, { max: 1 });
	try {
		await databaseSql.unsafe(`ALTER SCHEMA public OWNER TO ${role}`);
		await databaseSql.unsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${role}`);
		await databaseSql.unsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
		await databaseSql.unsafe(
			`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`
		);
		await databaseSql.unsafe(
			`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`
		);
		await databaseSql.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
	} finally {
		await databaseSql.end();
	}

	for (const [key, value] of Object.entries({
		DATABASE_URL: databaseUrl,
		DB_HOST: host,
		DB_PORT: port,
		DB_NAME: dbName,
		DB_USER: dbUser
	}))
		await upsertSecret(appClient, key, value, appOptions);
	return { created: true };
}

if (import.meta.url === `file://${process.argv[1]}`) await provisionDatabase();
