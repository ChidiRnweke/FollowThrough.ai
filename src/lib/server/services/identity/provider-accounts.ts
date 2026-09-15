import type { User } from '$lib/models/identity';
import type { OAuthUserInfo } from '$lib/models/identity/oauth';
import type { UserRepository } from '$lib/server/repositories/identity';

export interface IProviderAccounts {
	resolve(userInfo: OAuthUserInfo): Promise<User>;
}

export class ProviderAccounts implements IProviderAccounts {
	constructor(private readonly users: UserRepository) {}
	async resolve(userInfo: OAuthUserInfo): Promise<User> {
		const existingByProviderId = await this.users.findByAuthProviderId(userInfo.sub);
		if (existingByProviderId) return existingByProviderId;
		const existingByEmail = await this.users.findByEmail(userInfo.email);
		if (existingByEmail) {
			await this.users.updateAuthProvider(existingByEmail.id, 'authentik', userInfo.sub);
			return { ...existingByEmail, authProvider: 'authentik', authProviderId: userInfo.sub };
		}
		return this.users.create({
			email: userInfo.email,
			displayName: userInfo.name || userInfo.nickname || userInfo.email.split('@')[0],
			avatarUrl: userInfo.picture || null,
			role: 'WAITING',
			authProvider: 'authentik',
			authProviderId: userInfo.sub
		});
	}
}
