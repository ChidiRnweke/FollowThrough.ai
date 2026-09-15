import type { Session, User } from '$lib/models/identity';
import type { PKCEChallenge } from '$lib/models/identity/oauth';
import type { IOAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import type { IProviderAccounts } from '$lib/server/services/identity/provider-accounts';
import type { ISessionRegistry } from '$lib/server/services/identity/sessions';

export interface ISignIn {
	generatePKCE(): Promise<PKCEChallenge>;
	getAuthorizationUrl(state: string, codeChallenge: string): Promise<string>;
	completeOAuthFlow(code: string, codeVerifier: string): Promise<{ user: User; session: Session }>;
}
export interface SignInDependencies {
	readonly authorization: IOAuthAuthorization;
	readonly accounts: IProviderAccounts;
	readonly sessions: ISessionRegistry;
}

export class SignIn implements ISignIn {
	constructor(private readonly dependencies: SignInDependencies) {}
	generatePKCE(): Promise<PKCEChallenge> {
		return this.dependencies.authorization.generatePKCE();
	}
	getAuthorizationUrl(state: string, codeChallenge: string): Promise<string> {
		return this.dependencies.authorization.getAuthorizationUrl(state, codeChallenge);
	}
	async completeOAuthFlow(
		code: string,
		codeVerifier: string
	): Promise<{ user: User; session: Session }> {
		const tokens = await this.dependencies.authorization.exchangeCodeForTokens(code, codeVerifier);
		const userInfo = await this.dependencies.authorization.getUserInfo(tokens.access_token);
		const user = await this.dependencies.accounts.resolve(userInfo);
		const session = await this.dependencies.sessions.createSession(user.id);
		return { user, session };
	}
}
