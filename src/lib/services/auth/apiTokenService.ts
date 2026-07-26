import { createHash } from 'node:crypto';
import type { ActorContext, ApiToken, ApiTokenId, ApiTokenScope, User, UserId } from '$lib/models';
import type { ApiTokenRepository } from '$lib/repositories';

/** Distinguishes our credentials from anything else pasted into a client config. */
const TOKEN_PREFIX = 'ftm_';

export interface MintedApiToken {
	readonly token: ApiToken;
	/** The plaintext credential. Returned once, never persisted or recoverable. */
	readonly plaintext: string;
}

export interface VerifiedApiToken {
	readonly user: User;
	readonly scope: ApiTokenScope;
	readonly tokenId: ApiTokenId;
}

export interface IApiTokenService {
	mint(
		userId: UserId,
		input: { name: string; scope: ApiTokenScope; expiresAt?: Date }
	): Promise<MintedApiToken>;
	/** Takes the raw `Authorization` header; returns null for anything unusable. */
	verify(authorizationHeader: string | null): Promise<VerifiedApiToken | null>;
	list(actor: ActorContext): Promise<readonly ApiToken[]>;
	revoke(actor: ActorContext, id: ApiTokenId): Promise<void>;
}

const generatePlaintext = (): string => {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const hex = Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	return `${TOKEN_PREFIX}${hex}`;
};

/**
 * Tokens are high-entropy random strings, not passwords, so a single sha256 is
 * the right primitive: it makes the stored value non-reversible without making
 * the per-request lookup a scan.
 */
export const hashApiToken = (plaintext: string): string =>
	createHash('sha256').update(plaintext).digest('hex');

const bearerToken = (header: string | null): string | null => {
	if (!header) return null;
	const [scheme, ...rest] = header.trim().split(/\s+/);
	if (scheme.toLowerCase() !== 'bearer' || rest.length !== 1) return null;
	return rest[0].startsWith(TOKEN_PREFIX) ? rest[0] : null;
};

export class ApiTokenService implements IApiTokenService {
	constructor(private readonly tokens: ApiTokenRepository) {}

	async mint(
		userId: UserId,
		input: { name: string; scope: ApiTokenScope; expiresAt?: Date }
	): Promise<MintedApiToken> {
		const plaintext = generatePlaintext();
		const token = await this.tokens.create({
			userId,
			name: input.name,
			tokenHash: hashApiToken(plaintext),
			scope: input.scope,
			...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
		});
		return { token, plaintext };
	}

	async verify(authorizationHeader: string | null): Promise<VerifiedApiToken | null> {
		const plaintext = bearerToken(authorizationHeader);
		if (!plaintext) return null;

		const result = await this.tokens.findByHashWithUser(hashApiToken(plaintext));
		if (!result) return null;
		if (result.token.revokedAt) return null;
		if (result.token.expiresAt && Date.now() >= Date.parse(result.token.expiresAt)) return null;
		// A token is only as good as the account behind it: approval gating in
		// `hooks.server.ts` must not be bypassable by minting a credential.
		if (result.user.role === 'WAITING') return null;

		// Best-effort: a failed bookkeeping write must not fail the request.
		void this.tokens.touchLastUsed(result.token.id, new Date()).catch(() => {});

		return { user: result.user, scope: result.token.scope, tokenId: result.token.id };
	}

	list(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.tokens.listForUser(actor);
	}

	revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		return this.tokens.revoke(actor, id);
	}
}
