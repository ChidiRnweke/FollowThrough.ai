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
	/** Deadline for each token and profile request, in milliseconds. */
	readonly requestTimeoutMs: number;
}

/**
 * The most of a failed response's body that an error message quotes. An OAuth error body is a
 * short JSON object (RFC 6749 §5.2); 500 bytes shows it whole, while a proxy's HTML error page
 * or an endless body cannot grow the message or hold the request open.
 */
const ERROR_EXCERPT_BYTES = 500;

/** Reads at most `ERROR_EXCERPT_BYTES` of the body, then releases the rest unread. */
const errorExcerpt = async (response: Response): Promise<string> => {
	if (!response.body) return '';
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let received = 0;
	// One byte past the excerpt tells a body that fits from one that was cut.
	while (received <= ERROR_EXCERPT_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
		received += value.byteLength;
	}
	await reader.cancel();
	const text = Buffer.concat(chunks).subarray(0, ERROR_EXCERPT_BYTES).toString('utf8');
	return received > ERROR_EXCERPT_BYTES ? `${text}… (first ${ERROR_EXCERPT_BYTES} bytes)` : text;
};

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
			}),
			signal: AbortSignal.timeout(this.config.requestTimeoutMs)
		});
		if (!response.ok)
			throw new Error(
				`Token exchange failed with status ${response.status}: ${await errorExcerpt(response)}`
			);
		return oauthTokensSchema.parse(await response.json());
	}
	async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
		const response = await this.fetch(`https://${this.config.domain}/application/o/userinfo/`, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(this.config.requestTimeoutMs)
		});
		if (!response.ok)
			throw new Error(
				`Failed to fetch user info with status ${response.status}: ${await errorExcerpt(response)}`
			);
		return oauthUserInfoSchema.parse(await response.json());
	}
}
