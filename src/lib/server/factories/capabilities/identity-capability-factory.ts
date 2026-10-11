import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import { ApiTokenRecords } from '$lib/server/repositories/identity/postgres/api-tokens';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { UserPreferencesRecords } from '$lib/server/repositories/identity/postgres/user-preferences';
import { AccessTokens, type IAccessTokens } from '$lib/server/services/identity/api-tokens';
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
	readonly apiTokens: IAccessTokens;
	readonly userPreferences: UserPreferencesReader & UserPreferencesWriter;
}

export const createIdentityCapability = (
	actor: ActorContext,
	input: IdentityCapabilityInput
): IdentityCapability => ({
	userReader: new UserDirectory(new UserRecords(actor, input.db)),
	apiTokens: new AccessTokens(new ApiTokenRecords(actor, input.db)),
	userPreferences: new UserPreferenceStore(new UserPreferencesRecords(actor, input.db))
});
