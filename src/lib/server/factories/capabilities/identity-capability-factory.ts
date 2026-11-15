import { tracedService } from '$lib/server/infrastructure/telemetry/service-boundary';
import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import type { ScheduledTask } from '$lib/models/maintenance';
import { UnusedClientSweep } from '$lib/server/controllers/identity/client-retention';
import { ClientMetadataDocuments } from '$lib/server/repositories/identity/client-metadata-documents';
import {
	McpClientRecords,
	McpGrantRecords
} from '$lib/server/repositories/identity/postgres/mcp-authorization';
import { McpClientDirectory } from '$lib/server/services/identity/mcp-clients';
import { mcpClientRetention } from '$lib/server/config';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { UserPreferencesRecords } from '$lib/server/repositories/identity/postgres/user-preferences';
import { McpGrants, type McpConnectionLedger } from '$lib/server/services/identity/mcp-grants';
import { UserDirectory, type UserReader } from '$lib/server/services/identity/users';
import {
	UserPreferenceStore,
	type UserPreferencesReader,
	type UserPreferencesWriter
} from '$lib/server/services/identity/user-preferences';

export interface IdentityCapabilityInput {
	readonly db: Database;
}

export interface IdentityCapability {
	readonly userReader: UserReader;
	readonly mcpConnections: McpConnectionLedger;
	readonly userPreferences: UserPreferencesReader & UserPreferencesWriter;
}

export const createIdentityCapability = (
	actor: ActorContext,
	input: IdentityCapabilityInput
): IdentityCapability => ({
	userReader: tracedService('UserDirectory', new UserDirectory(new UserRecords(actor, input.db))),
	mcpConnections: tracedService('McpGrants', new McpGrants(new McpGrantRecords(actor, input.db))),
	userPreferences: tracedService(
		'UserPreferenceStore',
		new UserPreferenceStore(new UserPreferencesRecords(actor, input.db))
	)
});

/** Identity upkeep that acts for no user: anonymous client registrations nobody came back to. */
export const createIdentityMaintenance = (
	input: IdentityCapabilityInput
): { readonly tasks: readonly ScheduledTask[] } => {
	const retention = mcpClientRetention();
	return {
		tasks: [
			new UnusedClientSweep(
				tracedService(
					'McpClientDirectory',
					new McpClientDirectory({
						clients: new McpClientRecords(input.db),
						documents: new ClientMetadataDocuments()
					})
				),
				{ retentionMs: retention.unusedRetentionMs, intervalMs: retention.sweepIntervalMs }
			)
		]
	};
};
