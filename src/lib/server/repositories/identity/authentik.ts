import {
	oauthTokensSchema,
	oauthUserInfoSchema,
	type OAuthTokens,
	type OAuthUserInfo
} from '$lib/models/identity/oauth';

export interface AuthentikConfiguration {
	readonly domain: string;
	readonly clientId: string;
	readonly clientSecret: string;
	readonly callbackUrl: string;
}

/** The external identity provider's token and profile read boundary. */
export interface AuthentikRepository {
	exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens>;
	getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

export class AuthentikClient implements AuthentikRepository {
	constructor(
		private readonly config: AuthentikConfiguration,
		private readonly fetch: typeof globalThis.fetch = globalThis.fetch
	) {}
	async exchangeCode(code: string, codeVerifier: string): Promise<OAuthTokens> {
		const response = await this.fetch(`https://${this.config.domain}/application/o/token/`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				client_id: this.config.clientId,
				client_secret: this.config.clientSecret,
				code,
				redirect_uri: this.config.callbackUrl,
				code_verifier: codeVerifier
			})
		});
		if (!response.ok) throw new Error(`Token exchange failed: ${await response.text()}`);
		return oauthTokensSchema.parse(await response.json());
	}
	async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		const response = await this.fetch(`https://${this.config.domain}/application/o/userinfo/`, {
			headers: { Authorization: `Bearer ${accessToken}` }
		});
		if (!response.ok) throw new Error(`Failed to fetch user info: ${await response.text()}`);
		return oauthUserInfoSchema.parse(await response.json());
	}
}
