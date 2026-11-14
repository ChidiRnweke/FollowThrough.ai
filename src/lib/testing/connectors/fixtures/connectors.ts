import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DateTime } from '$lib/models/workspace';
import {
	Connectors,
	type ConnectorsController
} from '$lib/server/controllers/connectors/controller';
import { ConnectorAuthorization } from '$lib/server/services/connectors/authorization';
import { ConnectorDirectory } from '$lib/server/services/connectors/directory';
import { ConnectorServers } from '$lib/server/services/connectors/servers';
import { ConnectorToolPolicyRules } from '$lib/services/connectors/policy';
import {
	InMemoryToolEmbeddingRepository,
	InMemoryToolEmbeddings
} from '$lib/testing/agent/fakes/in-memory-tool-embeddings';
import { toolSearchFixture } from '$lib/testing/agent/fixtures/tool-discovery';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { FakeAuthorizationServer } from '../fakes/fake-authorization-server';
import { FakeConnectorNetwork } from '../fakes/fake-connector-network';
import { FakeConnectorServer } from '../fakes/fake-connector-server';
import {
	InMemoryConnectorAuthorizations,
	InMemoryConnectorRecords
} from '../fakes/in-memory-connectors';

/** A clock a test can move. */
export class TestClock {
	constructor(private current: Date) {}
	readonly now = (): DateTime => this.current.toISOString() as DateTime;
	readonly date = (): Date => this.current;
	advance(milliseconds: number): void {
		this.current = new Date(this.current.getTime() + milliseconds);
	}
}

export const readTool = (name: string): Tool => ({
	name,
	description: `Reads ${name}.`,
	inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
	annotations: { readOnlyHint: true }
});

export const writeTool = (name: string): Tool => ({
	name,
	description: `Changes ${name}.`,
	inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
});

/**
 * Linear's catalog entry signs in at a fake authorization server; Cloudflare
 * Docs needs no sign-in. Both answer through one fake network, so the real
 * connector services, SDK client and tool search run end to end.
 */
export const connectorsFixture = (options: { readonly origin?: string } = {}) => {
	const clock = new TestClock(new Date('2026-11-14T10:00:00Z'));
	const authorizationServer = new FakeAuthorizationServer('https://auth.linear.example', {
		metadataDocuments: true,
		registration: true,
		pkce: true,
		issuerInResponse: false,
		accessTokenSeconds: 3600,
		now: clock.date
	});
	const linear = new FakeConnectorServer('https://mcp.linear.app', {
		path: '/mcp',
		authorization: {
			kind: 'bearer',
			accepts: (token) => authorizationServer.accepts(token),
			authorizationServer: authorizationServer.issuer,
			scopes: []
		},
		tools: [readTool('list_issues'), writeTool('create_issue')]
	});
	const docs = new FakeConnectorServer('https://docs.mcp.cloudflare.com', {
		path: '/mcp',
		authorization: { kind: 'none' },
		tools: [readTool('search_docs')]
	});
	const network = new FakeConnectorNetwork()
		.route(linear.origin, linear.handle)
		.route(docs.origin, docs.handle)
		.route(authorizationServer.issuer, authorizationServer.handle);
	const records = new InMemoryConnectorRecords();
	const directory = new ConnectorDirectory({
		connectors: records,
		authorizations: new InMemoryConnectorAuthorizations(),
		now: clock.now
	});
	const embeddings = new InMemoryToolEmbeddings();
	const controller: ConnectorsController = new Connectors({
		policy: new ConnectorToolPolicyRules(),
		setup: {
			kind: 'configured',
			registry: directory,
			attempts: directory,
			authorizer: new ConnectorAuthorization({
				fetch: network.fetch,
				origin: options.origin ?? 'https://followthrough.example',
				preregistered: new Map(),
				now: clock.now
			}),
			servers: new ConnectorServers(network.fetch),
			embeddings: toolSearchFixture(new InMemoryToolEmbeddingRepository(), embeddings),
			preregistered: new Set(),
			transactionRunner: new InMemoryTransactionRunner([records]),
			now: clock.now
		}
	});
	return {
		clock,
		authorizationServer,
		linear,
		docs,
		network,
		records,
		directory,
		embeddings,
		controller
	};
};
