import type { ActorContext, McpScope, Session, User } from '$lib/models/identity';
import type { McpBearerVerifier } from '$lib/server/services/identity/mcp-grants';
import type { ISessionRegistry } from '$lib/server/services/identity/sessions';

/** A verified bearer credential: the user it acts for and what it may do. */
export interface VerifiedCredential {
	readonly actor: ActorContext;
	readonly scope: McpScope;
}

/**
 * Establishes who a request acts for. It runs before any user is known, so it holds no actor;
 * everything after it runs in that user's composition.
 */
export interface AuthenticationController {
	/** Resume a browser session; an expired session is removed. Returns null for an unusable id. */
	resumeSession(sessionId: string): Promise<{ user: User; session: Session } | null>;
	endSession(sessionId: string): Promise<void>;
	/** Verify an MCP access token issued for `resource`. Returns null for anything unusable. */
	verifyBearer(
		authorizationHeader: string | null,
		resource: string
	): Promise<VerifiedCredential | null>;
}
export interface AuthenticationDependencies {
	readonly sessions: ISessionRegistry;
	readonly tokens: McpBearerVerifier;
}
export class Authentication implements AuthenticationController {
	constructor(private readonly dependencies: AuthenticationDependencies) {}
	resumeSession(sessionId: string): Promise<{ user: User; session: Session } | null> {
		return this.dependencies.sessions.validateSession(sessionId);
	}
	endSession(sessionId: string): Promise<void> {
		return this.dependencies.sessions.logout(sessionId);
	}
	async verifyBearer(
		authorizationHeader: string | null,
		resource: string
	): Promise<VerifiedCredential | null> {
		const verified = await this.dependencies.tokens.verify(authorizationHeader, resource);
		return verified ? { actor: { userId: verified.user.id }, scope: verified.scope } : null;
	}
}
