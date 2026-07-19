import type { WorkspaceFixture } from '../../lab/workspace';

/**
 * A workspace where user-level and project-level memory deliberately disagree.
 *
 * The agent's instructions say project memory wins inside a relevant project,
 * so a case that only ever seeded agreeing memories could never tell a correct
 * agent from one that ignores scope entirely.
 */
export const conflictingScopeWorkspace: WorkspaceFixture = {
	memories: ['Always write code examples in Python.', 'I prefer short answers with no preamble.'],
	projects: [
		{
			name: 'Ledger Service',
			memories: [
				'The Ledger Service codebase is TypeScript only. Never propose Python for this project.',
				'Ledger Service deploys to Cloudflare Workers.'
			],
			notes: [
				{
					title: 'Ledger Service overview',
					body: [
						'The Ledger Service records immutable double-entry transactions for the billing platform.',
						'It is written in TypeScript and deployed to Cloudflare Workers behind an API gateway.',
						'Every posting must balance to zero across debit and credit legs before it is accepted.'
					].join('\n\n')
				}
			]
		},
		{
			name: 'Data Platform',
			memories: ['The Data Platform team standardised on Python 3.12 and Polars.'],
			notes: [
				{
					title: 'Ingestion pipeline',
					body: [
						'The ingestion pipeline pulls CDC events from Postgres into an Iceberg lakehouse.',
						'Backfills are orchestrated with Dagster and run nightly at 02:00 UTC.',
						'Schema drift is detected by comparing the incoming Avro schema against the registry.'
					].join('\n\n')
				}
			]
		}
	]
};

/**
 * Retrieval corpus with several plausibly-similar documents, so a search case
 * measures ranking rather than "did anything come back at all".
 */
export const retrievalCorpusWorkspace: WorkspaceFixture = {
	projects: [
		{
			name: 'Runbooks',
			notes: [
				{
					title: 'Postgres failover runbook',
					body: [
						'When the primary Postgres instance becomes unreachable, promote the standby using pg_ctl promote.',
						'Update the connection string in the secret store and restart the API pods in a rolling fashion.',
						'Verify replication lag has returned to zero before re-enabling nightly backups.'
					].join('\n\n')
				},
				{
					title: 'Redis cache eviction runbook',
					body: [
						'Redis evicts keys under memory pressure using the allkeys-lru policy.',
						'If the hit rate drops below 80 percent, raise maxmemory before adding more replicas.',
						'Never flush the cache during business hours; warm it from the read replica instead.'
					].join('\n\n')
				},
				{
					title: 'Certificate rotation runbook',
					body: [
						'TLS certificates are issued by Let us Encrypt and rotate automatically every sixty days.',
						'If renewal fails, check the ACME challenge path is reachable through the ingress.',
						'Expired certificates surface as handshake failures in the gateway logs.'
					].join('\n\n')
				}
			]
		}
	]
};
