import type { OAuthTokens, OAuthUserInfo, PKCEChallenge } from '$lib/models/identity/oauth';
import type {
	AuthentikConfiguration,
	AuthentikRepository
} from '$lib/server/repositories/identity/authentik';

export interface IOAuthAuthorization {
	generatePKCE(): Promise<PKCEChallenge>;
	getAuthorizationUrl(state: string, codeChallenge: string): Promise<string>;
	exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens>;
	getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

const base64URL = (bytes: Uint8Array): string =>
	btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
const randomVerifier = (): string => base64URL(crypto.getRandomValues(new Uint8Array(32)));

export class OAuthAuthorization implements IOAuthAuthorization {
	constructor(
		private readonly provider: AuthentikRepository,
		private readonly config: Pick<AuthentikConfiguration, 'domain' | 'clientId' | 'callbackUrl'>
	) {}
	async generatePKCE(): Promise<PKCEChallenge> {
		const codeVerifier = randomVerifier();
		const codeChallenge = base64URL(
			new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)))
		);
		return { codeChallenge, codeVerifier, state: randomVerifier() };
	}
	async getAuthorizationUrl(state: string, codeChallenge: string): Promise<string> {
		const params = new URLSearchParams({
			response_type: 'code',
			client_id: this.config.clientId,
			redirect_uri: this.config.callbackUrl,
			scope: 'openid profile email',
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256'
		});
		return `https://${this.config.domain}/application/o/authorize/?${params.toString()}`;
	}
	exchangeCodeForTokens(code: string, codeVerifier: string): Promise<OAuthTokens> {
		return this.provider.exchangeCode(code, codeVerifier);
	}
	getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		return this.provider.getUserInfo(accessToken);
	}
}
