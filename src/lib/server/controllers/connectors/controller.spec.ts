import { describe, expect, it } from 'vitest';
import { ExternalServiceError, ValidationError } from '$lib/errors';
import type { AuthorizationCallback, ConnectorId, ConnectStart } from '$lib/models/connectors';
import { ConnectorToolPolicyRules } from '$lib/services/connectors/policy';
import { FakeConnectorServer } from '$lib/testing/connectors/fakes/fake-connector-server';
import {
	connectorsFixture,
	readTool,
	writeTool
} from '$lib/testing/connectors/fixtures/connectors';
import { Connectors } from './controller';

const authorizationUrl = (start: ConnectStart): string => {
	if (start.kind !== 'authorize') throw new Error(`Expected a redirect, got ${start.kind}`);
	return start.authorizationUrl;
};

/** The user signs in at the authorization server, which redirects back. */
const signIn = async (
	fixture: ReturnType<typeof connectorsFixture>,
	start: ConnectStart
): Promise<ConnectorId> => {
	const approval = fixture.authorizationServer.approve(authorizationUrl(start));
	const callback: AuthorizationCallback = {
		state: approval.state,
		issuer: approval.iss,
		outcome: { kind: 'code', code: approval.code }
	};
	return fixture.controller.completeAuthorization(callback);
};

describe('Connectors', () => {
	it('connects a catalog server through its sign-in and lists it with what its tools will do', async () => {
		const fixture = connectorsFixture();
		const id = await signIn(
			fixture,
			await fixture.controller.connect({ kind: 'catalog', catalogId: 'linear' })
		);
		const overview = await fixture.controller.list();
		const catalog = await fixture.controller.catalog();
		expect({
			overview:
				overview.kind === 'ready'
					? overview.connectors.map(({ connector, tools }) => ({
							slug: connector.slug,
							authentication: connector.authentication,
							status: connector.status,
							tools
						}))
					: overview,
			linear: catalog.find((view) => view.entry.id === 'linear')?.availability
		}).toEqual({
			overview: [
				{
					slug: 'linear',
					authentication: 'oauth',
					status: { kind: 'connected' },
					tools: { total: 2, unusable: 0, asking: 1, off: 0 }
				}
			],
			linear: { kind: 'connected', connectorId: id }
		});
	});

	it('connects a catalog server that needs no sign-in at once, with embedded tools', async () => {
		const fixture = connectorsFixture();
		const start = await fixture.controller.connect({ kind: 'catalog', catalogId: 'cloudflare' });
		const detail =
			start.kind === 'connected' ? await fixture.controller.get(start.connectorId) : undefined;
		expect({
			kind: start.kind,
			tools: detail?.tools.map((tool) => tool.modelName),
			embedded: fixture.embeddings.requests
		}).toEqual({
			kind: 'connected',
			tools: ['cloudflare__search_docs'],
			embedded: [['cloudflare__search_docs: [Cloudflare Docs] search_docs. Reads search_docs.']]
		});
	});

	it('connects a custom server with a token it accepts and refuses one it does not', async () => {
		const fixture = connectorsFixture();
		const server = new FakeConnectorServer('https://tools.acme.example', {
			path: '/mcp',
			authorization: {
				kind: 'bearer',
				accepts: (token) => token === 'acme-token',
				authorizationServer: undefined,
				scopes: []
			},
			tools: [writeTool('deploy')]
		});
		fixture.network.route(server.origin, server.handle);
		const request = (token: string) =>
			({
				kind: 'custom',
				serverUrl: server.url,
				title: 'Acme tools',
				authentication: { kind: 'token', token }
			}) as const;
		await expect(fixture.controller.connect(request('wrong'))).rejects.toBeInstanceOf(
			ValidationError
		);
		const start = await fixture.controller.connect(request('acme-token'));
		const detail =
			start.kind === 'connected' ? await fixture.controller.get(start.connectorId) : undefined;
		expect({
			slug: detail?.connector.slug,
			authentication: detail?.connector.authentication,
			tools: detail?.tools.map((tool) => tool.modelName)
		}).toEqual({ slug: 'acmetools', authentication: 'bearer', tools: ['acmetools__deploy'] });
	});

	it('renews an expired token before listing, and keeps policies for tools the server still has', async () => {
		const fixture = connectorsFixture();
		const id = await signIn(
			fixture,
			await fixture.controller.connect({ kind: 'catalog', catalogId: 'linear' })
		);
		await fixture.controller.setToolPolicy({
			connectorId: id,
			serverName: 'create_issue',
			policy: 'allow'
		});
		fixture.linear.tools = [writeTool('create_issue'), readTool('list_projects')];
		fixture.clock.advance(2 * 60 * 60 * 1000);
		const detail = await fixture.controller.refreshTools(id);
		const refreshGrants = fixture.authorizationServer.tokenRequests.filter(
			(form) => form.get('grant_type') === 'refresh_token'
		);
		expect({
			renewed: refreshGrants.length,
			tools: detail.tools.map((tool) => [tool.serverName, tool.policy])
		}).toEqual({
			renewed: 1,
			tools: [
				['create_issue', { kind: 'chosen', choice: 'allow' }],
				['list_projects', { kind: 'default' }]
			]
		});
	});

	it('marks a connector for sign-in when the service revoked it, and reconnects it in place', async () => {
		const fixture = connectorsFixture();
		const id = await signIn(
			fixture,
			await fixture.controller.connect({ kind: 'catalog', catalogId: 'linear' })
		);
		await fixture.controller.setToolPolicy({
			connectorId: id,
			serverName: 'list_issues',
			policy: 'off'
		});
		fixture.authorizationServer.revokeAll();
		await expect(fixture.controller.refreshTools(id)).rejects.toBeInstanceOf(ExternalServiceError);
		const needing = (await fixture.controller.get(id)).connector.status.kind;
		const reconnected = await signIn(fixture, await fixture.controller.reconnect(id));
		const after = await fixture.controller.get(id);
		expect({
			needing,
			sameConnector: reconnected === id,
			status: after.connector.status,
			kept: after.tools.find((tool) => tool.serverName === 'list_issues')?.policy
		}).toEqual({
			needing: 'reauthorization_required',
			sameConnector: true,
			status: { kind: 'connected' },
			kept: { kind: 'chosen', choice: 'off' }
		});
	});

	it('refuses a sign-in answer the second time it arrives', async () => {
		const fixture = connectorsFixture();
		const start = await fixture.controller.connect({ kind: 'catalog', catalogId: 'linear' });
		const approval = fixture.authorizationServer.approve(authorizationUrl(start));
		const answer: AuthorizationCallback = {
			state: approval.state,
			issuer: undefined,
			outcome: { kind: 'code', code: approval.code }
		};
		await fixture.controller.completeAuthorization(answer);
		await expect(fixture.controller.completeAuthorization(answer)).rejects.toThrow(
			'not one this account started'
		);
	});

	it('connects nothing when the user declines the sign-in', async () => {
		const fixture = connectorsFixture();
		const start = await fixture.controller.connect({
			kind: 'custom',
			serverUrl: fixture.linear.url,
			title: 'Linear again',
			authentication: { kind: 'discover' }
		});
		const { state } = fixture.authorizationServer.approve(authorizationUrl(start));
		await expect(
			fixture.controller.completeAuthorization({
				state,
				issuer: undefined,
				outcome: { kind: 'denied', error: 'access_denied', description: undefined }
			})
		).rejects.toThrow('was not approved');
		expect(await fixture.controller.list()).toEqual({ kind: 'ready', connectors: [] });
	});

	it('says connectors are not set up when the deployment has no keys', async () => {
		const controller = new Connectors({
			policy: new ConnectorToolPolicyRules(),
			setup: { kind: 'unconfigured' }
		});
		await expect(controller.connect({ kind: 'catalog', catalogId: 'linear' })).rejects.toThrow(
			'CONNECTOR_SECRET_KEYS'
		);
		expect({
			list: await controller.list(),
			catalog: new Set((await controller.catalog()).map((view) => view.availability.kind))
		}).toEqual({ list: { kind: 'unconfigured' }, catalog: new Set(['unconfigured']) });
	});
});
