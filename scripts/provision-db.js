/* eslint-disable @typescript-eslint/ban-ts-comment -- Node executes this JavaScript entrypoint directly. */
// @ts-nocheck -- behaviour and dependency contracts are covered by Vitest fakes.
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { InfisicalSDK } from '@infisical/sdk';

// This entrypoint runs under plain `node`, so it cannot import the TypeScript
// defaults in src/lib/server/secrets.ts. Keep these two in sync with it.
const DEFAULT_DB_NAME = 'followthrough';
const DEFAULT_DB_USER = 'followthrough';

/**
 * Generate a secure random password
 */
function generatePassword() {
	return randomBytes(32).toString('base64url');
}

export const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

export function buildDatabaseUrl({ user, password, host, port, database }) {
	return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}

/**
 * Connect to Infisical and return authenticated client
 */
async function connectToInfisical(clientId, clientSecret, siteUrl) {
	const client = new InfisicalSDK({ siteUrl });
	await client.auth().universalAuth.login({ clientId, clientSecret });
	return client;
}

async function listSecretMap(client, projectId, environment) {
	const response = await client.secrets().listSecrets({
		environment,
		projectId,
		includeImports: true
	});
	const map = {};
	for (const secret of response.secrets) map[secret.secretKey] = secret.secretValue;
	return map;
}

/**
 * Check if secret exists in Infisical project.
 *
 * A listing failure (auth, network) must NOT be read as "no secret": that would
 * re-provision an existing database and rotate its password. Fail closed.
 */
async function getSecretIfExists(client, projectId, environment, secretKey) {
	return (await listSecretMap(client, projectId, environment))[secretKey] ?? null;
}

export function resolveDatabaseIdentity({ dbName, dbUser }) {
	return {
		dbName: dbName?.trim() || DEFAULT_DB_NAME,
		dbUser: dbUser?.trim() || DEFAULT_DB_USER
	};
}

/**
 * Force update or create a secret (Use this for Credentials that MUST match)
 */
async function updateOrCreateSecret(client, projectId, environment, secretKey, secretValue) {
	try {
		// Try to update first
		try {
			await client.secrets().updateSecret(secretKey, {
				environment,
				projectId,
				secretValue
			});
			console.log(`Updated secret '${secretKey}' in Infisical`);
		} catch {
			// If update fails (doesn't exist), create it
			await client.secrets().createSecret(secretKey, {
				environment,
				projectId,
				secretValue
			});
			console.log(`Created secret '${secretKey}' in Infisical`);
		}
	} catch (err) {
		throw new Error(`Failed to save secret '${secretKey}': ${err.message}`, { cause: err });
	}
}

/**
 * Only create secret if it doesn't exist (Use this for Config like Host/Port)
 */
async function createSecretOnly(client, projectId, environment, secretKey, secretValue) {
	try {
		// Check if it exists first to avoid errors and overwrites
		const secrets = await listSecretMap(client, projectId, environment);

		if (secretKey in secrets) {
			console.log(`Secret '${secretKey}' already exists. Preserving existing value.`);
			return;
		}

		// It doesn't exist, so create it
		await client.secrets().createSecret(secretKey, {
			environment,
			projectId,
			secretValue
		});
		console.log(`Created default secret '${secretKey}' in Infisical`);
	} catch (err) {
		console.warn(`Warning: Could not set default for '${secretKey}': ${err.message}`);
	}
}

/**
 * Provision database and user, then store connection string in Infisical
 */
export async function provisionDatabase({
	environment = process.env,
	appClient,
	adminClient,
	postgresClient = postgres,
	passwordFactory = generatePassword
} = {}) {
	console.log('Starting database provisioning...');

	// Admin Infisical credentials (for accessing PostgreSQL admin credentials)
	const adminClientId = environment.INFISICAL_ADMIN_CLIENT_ID;
	const adminClientSecret = environment.INFISICAL_ADMIN_CLIENT_SECRET;
	const adminProjectId = environment.INFISICAL_ADMIN_PROJECT_ID;

	// App Infisical credentials (for upserting DATABASE_URL)
	const appClientId = environment.INFISICAL_CLIENT_ID;
	const appClientSecret = environment.INFISICAL_CLIENT_SECRET;
	const appProjectId = environment.INFISICAL_PROJECT_ID;
	const appEnvironment = environment.INFISICAL_ENVIRONMENT;

	const siteUrl = environment.INFISICAL_URL;

	if (!appEnvironment) {
		throw new Error('Missing INFISICAL_ENVIRONMENT environment variable');
	}

	// Validate all required credentials
	if (!adminProjectId || !siteUrl || (!adminClient && (!adminClientId || !adminClientSecret))) {
		throw new Error(
			'Missing admin Infisical credentials (INFISICAL_ADMIN_CLIENT_ID, INFISICAL_ADMIN_CLIENT_SECRET, INFISICAL_ADMIN_PROJECT_ID, INFISICAL_URL)'
		);
	}

	if (!appProjectId || (!appClient && (!appClientId || !appClientSecret))) {
		throw new Error(
			'Missing app Infisical credentials (INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET, INFISICAL_PROJECT_ID)'
		);
	}

	// Connect to both Infisical projects
	console.log('Connecting to app Infisical project...');
	const appInfisical =
		appClient ?? (await connectToInfisical(appClientId, appClientSecret, siteUrl));

	// Check if DATABASE_URL already exists in app project
	console.log('Checking for existing DATABASE_URL in app project...');
	const existingDatabaseUrl = await getSecretIfExists(
		appInfisical,
		appProjectId,
		appEnvironment,
		'DATABASE_URL'
	);

	if (existingDatabaseUrl) {
		console.log('DATABASE_URL already exists in Infisical. Skipping database provisioning.');
		return { created: false, databaseUrl: existingDatabaseUrl };
	}

	console.log('DATABASE_URL not found. Proceeding to provision database...');

	console.log('Connecting to admin Infisical project...');
	const adminInfisical =
		adminClient ?? (await connectToInfisical(adminClientId, adminClientSecret, siteUrl));

	// Fetch PostgreSQL admin credentials from admin project
	console.log('Fetching PostgreSQL admin credentials...');
	const adminSecretMap = await listSecretMap(adminInfisical, adminProjectId, appEnvironment);

	const adminUser = adminSecretMap['POSTGRES_ADMIN_USER'];
	const adminPassword = adminSecretMap['POSTGRES_ADMIN_PASSWORD'];
	const postgresHost = adminSecretMap['POSTGRES_HOST'];
	const postgresPort = adminSecretMap['POSTGRES_PORT'];

	if (!adminUser || !adminPassword) {
		throw new Error(
			'Missing POSTGRES_ADMIN_USER or POSTGRES_ADMIN_PASSWORD in admin Infisical project'
		);
	}

	if (!postgresHost) {
		throw new Error('Missing POSTGRES_HOST in admin Infisical project');
	}

	const port = postgresPort ? parseInt(postgresPort) : 5432;

	// Database name and user are project-specific configuration.
	const { dbName, dbUser } = resolveDatabaseIdentity({
		dbName: environment.DB_NAME,
		dbUser: environment.DB_USER
	});

	const database = quoteIdentifier(dbName);
	const role = quoteIdentifier(dbUser);
	const dbPassword = passwordFactory();

	// Connect to PostgreSQL as admin
	const adminConnectionString = buildDatabaseUrl({
		user: adminUser,
		password: adminPassword,
		host: postgresHost,
		port,
		database: 'postgres'
	});

	console.log(`Connecting to PostgreSQL at ${postgresHost}:${port}...`);
	const adminSql = postgresClient(adminConnectionString, { max: 1 });

	try {
		console.log(`Checking if database '${dbName}' exists...`);
		const databaseExists =
			(await adminSql`select 1 from pg_database where datname = ${dbName}`).length > 0;

		if (!databaseExists) {
			console.log(`Creating database '${dbName}'...`);
			await adminSql.unsafe(`CREATE DATABASE ${database}`);
			console.log(`Database '${dbName}' created successfully.`);
		} else {
			console.log(`Database '${dbName}' already exists.`);
		}

		console.log(`Checking if user '${dbUser}' exists...`);
		const roleExists =
			(await adminSql`select 1 from pg_roles where rolname = ${dbUser}`).length > 0;

		if (!roleExists) {
			console.log(`Creating user '${dbUser}'...`);
			await adminSql.unsafe(`CREATE ROLE ${role} WITH LOGIN PASSWORD $1`, [dbPassword]);
			console.log(`User '${dbUser}' created successfully.`);
		} else {
			console.log(`User '${dbUser}' already exists. Updating password...`);
			await adminSql.unsafe(`ALTER ROLE ${role} WITH LOGIN PASSWORD $1`, [dbPassword]);
			console.log(`User '${dbUser}' password updated.`);
		}

		// Grant privileges - make user the owner for full control
		console.log(`Granting privileges on database '${dbName}' to user '${dbUser}'...`);
		await adminSql.unsafe(`ALTER DATABASE ${database} OWNER TO ${role}`);
		await adminSql.unsafe(`GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${role}`);
	} finally {
		await adminSql.end();
	}

	console.log(`Reconnecting to '${dbName}' to grant schema privileges...`);

	const appDbConnectionString = buildDatabaseUrl({
		user: adminUser,
		password: adminPassword,
		host: postgresHost,
		port,
		database: dbName
	});
	const appDbSql = postgresClient(appDbConnectionString, { max: 1 });

	try {
		console.log(`Granting schema privileges on '${dbName}'...`);
		await appDbSql.unsafe(`ALTER SCHEMA public OWNER TO ${role}`);
		await appDbSql.unsafe(`GRANT ALL ON SCHEMA public TO ${role}`);
		await appDbSql.unsafe(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${role}`);
		await appDbSql.unsafe(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
		await appDbSql.unsafe(
			`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${role}`
		);
		await appDbSql.unsafe(
			`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${role}`
		);

		// Hardening: Revoke CREATE from public to prevent other users from creating tables
		await appDbSql.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');

		console.log('Database privileges granted successfully.');
	} finally {
		await appDbSql.end();
	}

	// Create connection string
	const databaseUrl = buildDatabaseUrl({
		user: dbUser,
		password: dbPassword,
		host: postgresHost,
		port,
		database: dbName
	});

	// Store credentials in app Infisical project
	console.log('Storing database credentials in app Infisical project...');

	// For CREDENTIALS (DATABASE_URL): We MUST overwrite because we just generated a new password
	await updateOrCreateSecret(
		appInfisical,
		appProjectId,
		appEnvironment,
		'DATABASE_URL',
		databaseUrl
	);

	// For CONFIG: Only create if missing (Don't overwrite manual changes)
	await createSecretOnly(appInfisical, appProjectId, appEnvironment, 'DB_HOST', postgresHost);
	await createSecretOnly(appInfisical, appProjectId, appEnvironment, 'DB_PORT', port.toString());
	await createSecretOnly(appInfisical, appProjectId, appEnvironment, 'DB_NAME', dbName);
	await createSecretOnly(appInfisical, appProjectId, appEnvironment, 'DB_USER', dbUser);

	console.log('Database provisioning completed successfully!');
	return { created: true, databaseUrl };
}

// Run directly if called as script
if (import.meta.url === `file://${process.argv[1]}`) {
	provisionDatabase()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error('Database provisioning failed:', err);
			process.exit(1);
		});
}
