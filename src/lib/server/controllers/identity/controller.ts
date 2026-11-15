import type { Session, SessionToken, User } from '$lib/models/identity';
import type { PKCEChallenge } from '$lib/models/identity/oauth';
import type { IOAuthAuthorization } from '$lib/server/services/identity/oauth-authorization';
import type {
	AccountLinkRefusal,
	IProviderAccounts
} from '$lib/server/services/identity/provider-accounts';
import type { ISessionRegistry } from '$lib/server/services/identity/sessions';

/** A completed sign-in: the account, its new session, and the token for the session cookie. */
export interface SignedIn {
	readonly kind: 'signed-in';
	readonly user: User;
	readonly session: Session;
	readonly token: SessionToken;
}

export interface ISignIn {
	generatePKCE(): Promise<PKCEChallenge>;
	getAuthorizationUrl(state: string, codeChallenge: string): Promise<string>;
	/** Creates no session when the provider identity may not take over the account for its email. */
	completeOAuthFlow(code: string, codeVerifier: string): Promise<SignedIn | AccountLinkRefusal>;
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
	): Promise<SignedIn | AccountLinkRefusal> {
		const tokens = await this.dependencies.authorization.exchangeCodeForTokens(code, codeVerifier);
		const userInfo = await this.dependencies.authorization.getUserInfo(tokens.access_token);
		const account = await this.dependencies.accounts.resolve(userInfo);
		if (account.kind === 'failure') return account;
		const { token, session } = await this.dependencies.sessions.createSession(account.user.id);
		return { kind: 'signed-in', user: account.user, session, token };
	}
}
