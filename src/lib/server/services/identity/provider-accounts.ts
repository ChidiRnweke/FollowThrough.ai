import type { User } from '$lib/models/identity';
import type { OAuthUserInfo } from '$lib/models/identity/oauth';
import type { UserAccountRepository } from '$lib/server/repositories/identity';

/**
 * An account exists for the provider profile's email, and sign-in may not take it over:
 * `unverified-email` when the provider has not verified that email, `bound-elsewhere` when the
 * account already belongs to another provider identity. An administrator links such an account.
 */
export interface AccountLinkRefusal {
	readonly kind: 'failure';
	readonly reason: 'unverified-email' | 'bound-elsewhere';
}

export type ProviderAccountResolution =
	{ readonly kind: 'resolved'; readonly user: User } | AccountLinkRefusal;

export interface IProviderAccounts {
	resolve(userInfo: OAuthUserInfo): Promise<ProviderAccountResolution>;
}

export class ProviderAccounts implements IProviderAccounts {
	constructor(private readonly users: UserAccountRepository) {}
	async resolve(userInfo: OAuthUserInfo): Promise<ProviderAccountResolution> {
		const existingByProviderId = await this.users.findByAuthProviderId(userInfo.sub);
		if (existingByProviderId) return { kind: 'resolved', user: existingByProviderId };
		const existingByEmail = await this.users.findByEmail(userInfo.email);
		if (existingByEmail) {
			// Linking by email hands the provider identity the account and its role, so it needs
			// the provider's word that the email is the signer's, and an account nobody holds yet.
			if (!userInfo.email_verified) return { kind: 'failure', reason: 'unverified-email' };
			const linked = await this.users.linkAuthProvider(
				existingByEmail.id,
				'authentik',
				userInfo.sub
			);
			return linked
				? { kind: 'resolved', user: linked }
				: { kind: 'failure', reason: 'bound-elsewhere' };
		}
		const user = await this.users.create({
			email: userInfo.email,
			displayName: userInfo.name || userInfo.nickname || userInfo.email.split('@')[0],
			avatarUrl: userInfo.picture || null,
			role: 'WAITING',
			authProvider: 'authentik',
			authProviderId: userInfo.sub
		});
		return { kind: 'resolved', user };
	}
}
