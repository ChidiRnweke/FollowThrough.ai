import type { ProvenanceId } from '$lib/models/provenance';
import type { ActorContext, McpScope } from '$lib/models/identity';
import type {
	AuthorizationRedirect,
	AuthorizationRequest,
	OAuthFailure
} from '$lib/models/mcp-authorization';
import type { McpClientReview } from '$lib/server/services/identity/mcp-clients';
import type { McpCodeIssuer } from '$lib/server/services/identity/mcp-grants';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';

/** An authenticated MCP request: who it acts for, what it may do, and where its writes are attributed. */
export interface McpAccess {
	readonly actor: ActorContext;
	readonly scope: McpScope;
	readonly provenanceId: ProvenanceId;
}

/**
 * The authenticated user's access: approving MCP clients and attributing MCP requests.
 * Approval lives here rather than on the agent-facing connections controller, so no agent
 * tool can grant a client access that acts as the user.
 */
export interface AccessController {
	/**
	 * The user approved the request with `scope`. The request is reviewed again, because the
	 * approval form carries it back from the browser.
	 */
	approveMcpClient(
		request: AuthorizationRequest,
		scope: McpScope,
		resource: string
	): Promise<AuthorizationRedirect | OAuthFailure>;
	/** Attribute an MCP request whose bearer credential was verified for this user. */
	attributeMcp(scope: McpScope): Promise<McpAccess>;
}

export interface AccessDependencies {
	readonly clients: McpClientReview;
	readonly grants: McpCodeIssuer;
	readonly provenance: ProvenanceRecorder;
}

export class Access implements AccessController {
	constructor(
		private readonly actor: ActorContext,
		private readonly dependencies: AccessDependencies
	) {}

	async approveMcpClient(
		request: AuthorizationRequest,
		scope: McpScope,
		resource: string
	): Promise<AuthorizationRedirect | OAuthFailure> {
		const reviewed = await this.dependencies.clients.review(request, resource);
		if (reviewed.kind === 'failure') return reviewed;
		const code = await this.dependencies.grants.issueCode(reviewed, scope);
		return {
			kind: 'redirect',
			location: this.dependencies.clients.answer(reviewed, { kind: 'code', code })
		};
	}

	attributeMcp(scope: McpScope): Promise<McpAccess> {
		return this.attribute(scope);
	}

	private async attribute(scope: McpScope): Promise<McpAccess> {
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
