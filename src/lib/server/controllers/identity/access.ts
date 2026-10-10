import type { ProvenanceId } from '$lib/models/provenance';
import type { ActorContext, ApiTokenScope, Session, User } from '$lib/models/identity';
import type { IAccessTokens, MintedApiToken } from '$lib/server/services/identity/api-tokens';
import type { ISessionRegistry } from '$lib/server/services/identity/sessions';
import type { LocalUserProvisioner, UserReader } from '$lib/server/services/identity/users';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';

/** An authenticated MCP request: who it acts for, what it may do, and where its writes are attributed. */
export interface McpAccess {
	readonly actor: ActorContext;
	readonly scope: ApiTokenScope;
	readonly provenanceId: ProvenanceId;
}

/**
 * Request access: browser sessions, API token issuance, and MCP client attribution. Minting
 * lives here rather than on the agent-facing token controller, so no agent tool can issue a
 * credential that acts as the user.
 */
export interface AccessController {
	/** Resume a browser session; an expired session is removed. Returns null for an unusable id. */
	resumeSession(sessionId: string): Promise<{ user: User; session: Session } | null>;
	endSession(sessionId: string): Promise<void>;
	/** The plaintext credential is returned once and is not recoverable. */
	issueApiToken(
		actor: ActorContext,
		input: { name: string; scope: ApiTokenScope }
	): Promise<MintedApiToken>;
	/** Verify a bearer credential and attribute the request. Returns null for anything unusable. */
	authenticateMcp(authorizationHeader: string | null): Promise<McpAccess | null>;
	/** Single-user mode: establish the local profile, then attribute the request with full scope. */
	attributeLocalMcp(actor: ActorContext): Promise<McpAccess>;
}

export interface AccessDependencies {
	readonly sessions: ISessionRegistry;
	readonly tokens: IAccessTokens;
	readonly provisioner: LocalUserProvisioner;
	readonly users: UserReader;
	readonly provenance: ProvenanceRecorder;
}

export class Access implements AccessController {
	constructor(private readonly dependencies: AccessDependencies) {}

	resumeSession(sessionId: string): Promise<{ user: User; session: Session } | null> {
		return this.dependencies.sessions.validateSession(sessionId);
	}

	endSession(sessionId: string): Promise<void> {
		return this.dependencies.sessions.logout(sessionId);
	}

	issueApiToken(
		actor: ActorContext,
		input: { name: string; scope: ApiTokenScope }
	): Promise<MintedApiToken> {
		return this.dependencies.tokens.mint(actor.userId, input);
	}

	async authenticateMcp(authorizationHeader: string | null): Promise<McpAccess | null> {
		const verified = await this.dependencies.tokens.verify(authorizationHeader);
		if (!verified) return null;
		return this.attribute({ userId: verified.user.id }, verified.scope);
	}

	async attributeLocalMcp(actor: ActorContext): Promise<McpAccess> {
		await this.dependencies.provisioner.ensureLocal(actor);
		await this.dependencies.users.get(actor);
		return this.attribute(actor, 'full');
	}

	private async attribute(actor: ActorContext, scope: ApiTokenScope): Promise<McpAccess> {
		// Every write through a tool is attributable to this request.
		const provenance = await this.dependencies.provenance.record(actor, {
			producerKind: 'agent',
			producerName: 'MCP client',
			pipeline: 'agent',
			metadata: { scope }
		});
		return { actor, scope, provenanceId: provenance.id };
	}
}
