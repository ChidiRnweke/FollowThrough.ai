import type { Session, User, UserId } from '$lib/models';

export interface OAuthTokens {
	access_token: string;
	token_type: string;
	expires_in: number;
	id_token?: string;
}

export interface OAuthUserInfo {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
	nickname?: string;
}

export interface PKCEChallenge {
	codeChallenge: string;
	codeVerifier: string;
	state: string;
}

export interface OAuthResult {
	user: User;
	session: Session;
}

export interface IOAuthService {
	generatePKCE(): Promise<PKCEChallenge>;
	getAuthorizationUrl(state: string, codeChallenge: string): Promise<string>;
	exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens>;
	getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
	findOrCreateUser(userInfo: OAuthUserInfo): Promise<User>;
	createSession(userId: UserId): Promise<Session>;
	validateSession(sessionId: string): Promise<{ user: User; session: Session } | null>;
	logout(sessionId: string): Promise<void>;
	completeOAuthFlow(code: string, codeVerifier: string): Promise<OAuthResult>;
}
