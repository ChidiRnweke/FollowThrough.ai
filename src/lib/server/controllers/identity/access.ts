import type { ProvenanceId } from '$lib/models/provenance';
import type { ActorContext, ApiTokenScope } from '$lib/models/identity';
import type { IAccessTokens, MintedApiToken } from '$lib/server/services/identity/api-tokens';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';

/** An authenticated MCP request: who it acts for, what it may do, and where its writes are attributed. */
export interface McpAccess {
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
}

/**
 * The authenticated user's access: API token issuance and MCP request attribution. Minting
 * lives here rather than on the agent-facing token controller, so no agent tool can issue a
 * credential that acts as the user.
 */
export interface AccessController {
	/** The plaintext credential is returned once and is not recoverable. */
	issueApiToken(input: { name: string; scope: ApiTokenScope }): Promise<MintedApiToken>;
	/** Attribute an MCP request whose bearer credential was verified for this user. */
	attributeMcp(scope: ApiTokenScope): Promise<McpAccess>;
}

export interface AccessDependencies {
	readonly tokens: IAccessTokens;
	readonly provenance: ProvenanceRecorder;
}

export class Access implements AccessController {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: AccessDependencies
	) {}

	issueApiToken(input: { name: string; scope: ApiTokenScope }): Promise<MintedApiToken> {
		return this.dependencies.tokens.mint(input);
	}

	attributeMcp(scope: ApiTokenScope): Promise<McpAccess> {
		return this.attribute(scope);
	}

	private async attribute(scope: ApiTokenScope): Promise<McpAccess> {
		// Every write through a tool is attributable to this request.
		const provenance = await this.dependencies.provenance.record({
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope }
		});
		return { actor: this.actor, scope, provenanceId: provenance.id };
	}
}
