import type { ActorContext, ApiToken, ApiTokenId } from '$lib/models';
import type { IApiTokenService } from '$lib/services/auth/apiTokenService';

/**
 * Minting is deliberately absent. A token is a credential that acts as the
 * user, so issuing one stays a deliberate action in Settings rather than
 * something an agent session — including one already authenticated by a token —
 * can do for itself.
 */
export interface ApiTokensController {
	list(actor: ActorContext): Promise<readonly ApiToken[]>;
	revoke(actor: ActorContext, id: ApiTokenId): Promise<void>;
}

export interface ApiTokensDependencies {
	tokens: IApiTokenService;
}

export class DefaultApiTokensController implements ApiTokensController {
	constructor(private readonly dependencies: ApiTokensDependencies) {}

	list(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.dependencies.tokens.list(actor);
	}

	revoke(actor: ActorContext, id: ApiTokenId): Promise<void> {
		return this.dependencies.tokens.revoke(actor, id);
	}
}
