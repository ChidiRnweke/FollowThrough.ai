import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import { McpGrantRecords } from '$lib/server/repositories/identity/postgres/mcp-authorization';
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
	userReader: new UserDirectory(new UserRecords(actor, input.db)),
	mcpConnections: new McpGrants(new McpGrantRecords(actor, input.db)),
	userPreferences: new UserPreferenceStore(new UserPreferencesRecords(actor, input.db))
});
