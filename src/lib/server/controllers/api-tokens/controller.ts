import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { ActorContext, ApiToken, ApiTokenId } from '$lib/models/identity';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { IAccessTokens } from '$lib/server/services/identity/api-tokens';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

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
	revoke(actor: ActorContext, id: ApiTokenId): Promise<Pick<ApiToken, 'id' | 'name'>>;

	agentListApiTokens(
		actor: ActorContext,
		input: AgentToolInput<'list_api_tokens'>
	): Promise<AgentPayload>;
	agentRevokeApiToken(
		actor: ActorContext,
		input: AgentToolInput<'revoke_api_token'>
	): Promise<AgentPayload>;
}

export interface ApiTokensDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	tokens: IAccessTokens;
}

export class ApiTokens implements ApiTokensController {
	constructor(private readonly dependencies: ApiTokensDependencies) {}

	list(actor: ActorContext): Promise<readonly ApiToken[]> {
		return this.dependencies.tokens.list(actor);
	}

	revoke(actor: ActorContext, id: ApiTokenId): Promise<Pick<ApiToken, 'id' | 'name'>> {
		return this.dependencies.tokens.revoke(actor, id);
	}

	async agentListApiTokens(
		actor: ActorContext,
		input: AgentToolInput<'list_api_tokens'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.list(actor);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentRevokeApiToken(
		actor: ActorContext,
		input: AgentToolInput<'revoke_api_token'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const token = await this.revoke(actor, input.tokenId);
			return { tokenId: token.id, name: token.name, revoked: true as const };
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
}
