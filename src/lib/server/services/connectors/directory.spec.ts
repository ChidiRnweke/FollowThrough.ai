import { describe, expect, it } from 'vitest';
import { ConflictError } from '$lib/errors';
import type { DateTime } from '$lib/models/workspace';
import type {
	ConnectorSlug,
	ListedConnectorTool,
	PendingAuthorization
} from '$lib/models/connectors';
import {
	InMemoryConnectorAuthorizations,
	InMemoryConnectorRecords
} from '$lib/testing/connectors/fakes/in-memory-connectors';
import { ConnectorDirectory } from './directory';

const at = (iso: string) => () => iso as DateTime;

const directory = (now = at('2026-11-14T10:00:00Z')) =>
	new ConnectorDirectory({
		connectors: new InMemoryConnectorRecords(),
		authorizations: new InMemoryConnectorAuthorizations(),
		now
	});

const tool = (serverName: string): ListedConnectorTool => ({
	serverName,
	title: serverName,
	description: '',
	schema: { kind: 'unusable', reason: 'not needed here' },
	hints: { readOnly: true, destructive: false, idempotent: true, openWorld: false },
	checksum: serverName
});

describe('ConnectorDirectory', () => {
	it('names tools within the provider grammar and the same way on every refresh', () => {
		const names = directory()
			.name('linear' as ConnectorSlug, [
				tool('create_issue'),
				tool('issues.search'),
				tool('x'.repeat(60))
			])
			.map((entry) => entry.modelName);
		const again = directory()
			.name('linear' as ConnectorSlug, [tool('issues.search')])
			.map((entry) => entry.modelName);
		expect({
			plain: names[0],
			cleaned: /^linear__issues_search_[0-9a-f]{6}$/.test(names[1]!),
			fitsGrammar: names.every((name) => /^[a-zA-Z0-9_-]{1,64}$/.test(name)),
			stable: again[0] === names[1]
		}).toEqual({ plain: 'linear__create_issue', cleaned: true, fitsGrammar: true, stable: true });
	});

	it('gives a catalog entry its id once, and keeps custom slugs off catalog ids and each other', async () => {
		const connectors = directory();
		const linear = await connectors.allocateSlug(
			{ kind: 'catalog', catalogId: 'linear' },
			'Linear'
		);
		await connectors.create(
			{
				slug: linear,
				source: { kind: 'catalog', catalogId: 'linear' },
				title: 'Linear',
				serverUrl: 'https://mcp.linear.app/mcp',
				credential: { kind: 'none' }
			},
			[]
		);
		const custom = await connectors.allocateSlug({ kind: 'custom' }, 'Linear (self-hosted)');
		await expect(
			connectors.allocateSlug({ kind: 'catalog', catalogId: 'linear' }, 'Linear')
		).rejects.toBeInstanceOf(ConflictError);
		expect({ linear, custom }).toEqual({ linear: 'linear', custom: 'linearselfhosted' });
	});

	it('connects a catalog vendor under a suffixed slug when a custom server already holds its id', async () => {
		const connectors = directory();
		// A custom server named before the catalog listed Todoist kept the slug `todoist`.
		await connectors.create(
			{
				slug: 'todoist' as ConnectorSlug,
				source: { kind: 'custom' },
				title: 'Todoist',
				serverUrl: 'https://todoist.example.org/mcp',
				credential: { kind: 'none' }
			},
			[]
		);
		expect(
			await connectors.allocateSlug({ kind: 'catalog', catalogId: 'todoist' }, 'Todoist')
		).toBe('todoist2');
	});

	it('takes a sign-in attempt once and refuses it after it expires', async () => {
		let clock = '2026-11-14T10:00:00.000Z' as DateTime;
		const connectors = directory(() => clock);
		const pending: PendingAuthorization = {
			target: { kind: 'new', source: { kind: 'custom' }, title: 'Example' },
			serverUrl: 'https://mcp.example.com/mcp',
			grant: {
				authorizationServer: {
					issuer: 'https://auth.example.com',
					authorizationEndpoint: 'https://auth.example.com/authorize',
					tokenEndpoint: 'https://auth.example.com/token',
					tokenAuthMethods: [],
					issuerInResponse: false
				},
				resource: 'https://mcp.example.com/mcp',
				scopes: [],
				client: { kind: 'dynamic_public', clientId: 'c' }
			},
			codeVerifier: 'v',
			redirectUri: 'https://followthrough.example/connectors/callback'
		};
		await connectors.remember('state-1', pending);
		await connectors.remember('state-2', pending);
		const first = await connectors.recall('state-1');
		await expect(connectors.recall('state-1')).rejects.toThrow('not one this account started');
		clock = '2026-11-14T10:10:01.000Z' as DateTime;
		await expect(connectors.recall('state-2')).rejects.toThrow('expired');
		expect(first).toEqual(pending);
	});
});
