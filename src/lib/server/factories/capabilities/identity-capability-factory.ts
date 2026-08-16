import type { Database } from '$lib/server/db';
import { ApiTokenRecords } from '$lib/server/repositories/identity/postgres/api-tokens';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { AccessTokens, type IAccessTokens } from '$lib/server/services/identity/api-tokens';
import { UserDirectory, type UserReader } from '$lib/server/services/identity/users';

export interface IdentityCapabilityInput {
	readonly db: Database;
}

export interface IdentityCapability {
	readonly userReader: UserReader;
	readonly apiTokens: IAccessTokens;
}

export const createIdentityCapability = (input: IdentityCapabilityInput): IdentityCapability => ({
	userReader: new UserDirectory(new UserRecords(input.db)),
	apiTokens: new AccessTokens(new ApiTokenRecords(input.db))
});
