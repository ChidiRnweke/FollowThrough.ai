import type { ActorContext, ApiToken, ApiTokenId } from '$lib/models/identity';
import type { IAccessTokens } from '$lib/server/services/identity/api-tokens';

/**
 * Minting is deliberately absent. A token is a credential that acts as the
 * user, so issuing one stays a deliberate action in Settings rather than
 * something an agent session — including one already authenticated by a token —
 * can do for itself.
 */
export interface ApiTokensController {
	/** List the user's API tokens, with secrets masked. */
	list(actor: ActorContext): Promise<readonly ApiToken[]>;
	/** Permanently revoke a token; authenticated requests carrying it stop working from that point. */
	revoke(actor: ActorContext, id: ApiTokenId): Promise<void>;
}

export interface ApiTokensDependencies {
	tokens: IAccessTokens;
}

export class ApiTokens implements ApiTokensController {
	constructor(private readonly dependencies: ApiTokensDependencies) {}

	list(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.dependencies.tokens.list(actor);
	}

	revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		return this.dependencies.tokens.revoke(actor, id);
	}
}
