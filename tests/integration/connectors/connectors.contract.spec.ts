import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
	ConnectorCredential,
	ConnectorId,
	ConnectorSlug,
	ConnectorToolName,
	ListedConnectorTool,
	NamedSnapshotEntry,
	OAuthGrant,
	PendingAuthorization
} from '$lib/models/connectors';
import * as schema from '$lib/server/db/schema/connectors';
import { SecretBox } from '$lib/server/infrastructure/crypto/secret-box';
import {
	ConnectorAuthorizationRecords,
	ConnectorRecords
} from '$lib/server/repositories/connectors/postgres/connectors';
import { context, seedUser } from '../database-harness';

const key = (byte: number) => Buffer.alloc(32, byte).toString('base64');
const box = SecretBox.fromKeyring(`v1:${key(7)}`);
const connectorId = (suffix: string) =>
	`c0000000-0000-4000-8000-${suffix.padStart(12, '0')}` as ConnectorId;

const grant = {
	authorizationServer: {
		issuer: 'https://auth.linear.app',
		authorizationEndpoint: 'https://auth.linear.app/authorize',
		tokenEndpoint: 'https://auth.linear.app/token',
		tokenAuthMethods: ['none'],
		issuerInResponse: false
	},
	resource: 'https://mcp.linear.app/mcp',
	scopes: [],
	client: { kind: 'dynamic_public', clientId: 'client-1' }
} satisfies OAuthGrant;

const oauth: ConnectorCredential = {
	kind: 'oauth',
	grant,
	tokens: {
		accessToken: 'access-secret-value',
		expiry: { kind: 'unstated' },
		refresh: { kind: 'available', refreshToken: 'refresh-secret-value' }
	}
};

const listed = (serverName: string, readOnly: boolean): ListedConnectorTool => ({
	serverName,
	title: serverName,
	description: `${serverName} on the server`,
	schema: { kind: 'usable', inputSchema: { type: 'object', properties: {} } },
	hints: { readOnly, destructive: !readOnly, idempotent: false, openWorld: true },
	checksum: `${serverName}-v1`
});

const entry = (tool: ListedConnectorTool): NamedSnapshotEntry => ({
	kind: 'usable',
	tool,
	modelName: `linear__${tool.serverName}` as ConnectorToolName,
	embedding: Array.from({ length: 3072 }, () => 0.01),
	embeddingModel: 'embed-1'
});

const seedConnector = async (suffix: string, credential: ConnectorCredential = oauth) => {
	const owner = await seedUser(suffix);
	const records = new ConnectorRecords(owner, context.db, box);
	const connector = await records.insert(
		{
			id: connectorId(suffix),
			slug: 'linear' as ConnectorSlug,
			source: { kind: 'catalog', catalogId: 'linear' },
			title: 'Linear',
			serverUrl: 'https://mcp.linear.app/mcp',
			credential
		},
		new Date('2026-11-14T10:00:00Z')
	);
	return { owner, records, connector };
};

describe('connector records', () => {
	it('stores the credential sealed and reads it back for its owner only', async () => {
		const { records, connector } = await seedConnector('61001');
		const [row] = await context.db
			.select({ sealed: schema.connectors.sealedCredential })
			.from(schema.connectors)
			.where(eq(schema.connectors.id, connector.id));
		const stranger = new ConnectorRecords(await seedUser('61002'), context.db, box);
		expect({
			readable: await records.credential(connector.id),
			plaintextAtRest: row!.sealed!.includes('refresh-secret-value'),
			strangerList: await stranger.list(),
			strangerFind: await stranger.find(connector.id),
			strangerRemove: await stranger.remove(connector.id)
		}).toEqual({
			readable: { kind: 'readable', credential: oauth },
			plaintextAtRest: false,
			strangerList: [],
			strangerFind: undefined,
			strangerRemove: false
		});
	});

	it("shows a custom server's stored icon as its logo, to its owner only, until it is dropped", async () => {
		const owner = await seedUser('61020');
		const records = new ConnectorRecords(owner, context.db, box);
		const custom = await records.insert(
			{
				id: connectorId('61020'),
				slug: 'acme' as ConnectorSlug,
				source: { kind: 'custom' },
				title: 'Acme',
				serverUrl: 'https://tools.acme.example/mcp',
				credential: { kind: 'none' }
			},
			new Date('2026-11-14T10:00:00Z')
		);
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		await records.storeIcon(custom.id, {
			kind: 'icon',
			icon: { mediaType: 'image/png', bytes: png, checksum: 'icon-v1' }
		});
		const stored = {
			logo: (await records.find(custom.id))!.logo,
			icon: await records.icon(custom.id)
		};
		const stranger = await new ConnectorRecords(await seedUser('61021'), context.db, box).icon(
			custom.id
		);
		await records.storeIcon(custom.id, { kind: 'none' });
		expect({
			stored,
			stranger,
			dropped: { logo: (await records.find(custom.id))!.logo, icon: await records.icon(custom.id) }
		}).toEqual({
			stored: {
				logo: { kind: 'server_icon', connectorId: custom.id, checksum: 'icon-v1' },
				icon: { mediaType: 'image/png', bytes: png, checksum: 'icon-v1' }
			},
			stranger: undefined,
			dropped: { logo: { kind: 'monogram' }, icon: undefined }
		});
	});

	it('offers each tool to a run with the label of the connector it belongs to', async () => {
		const { owner, records, connector } = await seedConnector('61030');
		await records.replaceTools(
			connector.id,
			[entry(listed('list_issues', true))],
			new Date('2026-11-14T10:00:00Z')
		);
		const custom = await records.insert(
			{
				id: connectorId('61031'),
				slug: 'stripe' as ConnectorSlug,
				source: { kind: 'custom' },
				title: 'Billing proxy',
				serverUrl: 'https://billing.acme.example/mcp',
				credential: { kind: 'none' }
			},
			new Date('2026-11-14T10:00:00Z')
		);
		await records.replaceTools(
			custom.id,
			[
				{
					...entry(listed('list_charges', true)),
					modelName: 'stripe__list_charges' as ConnectorToolName
				}
			],
			new Date('2026-11-14T10:00:00Z')
		);
		const offered = await new ConnectorRecords(owner, context.db, box).runTools();
		expect(offered.map(({ tool, connector }) => [tool.modelName, connector])).toEqual([
			['linear__list_issues', { kind: 'catalog', catalogId: 'linear', title: 'Linear' }],
			['stripe__list_charges', { kind: 'custom', title: 'Billing proxy' }]
		]);
	});

	it('reports a credential sealed under a retired key as unreadable instead of failing', async () => {
		const { owner, connector } = await seedConnector('61003');
		const rotated = new ConnectorRecords(owner, context.db, SecretBox.fromKeyring(`v2:${key(8)}`));
		expect({
			status: (await rotated.find(connector.id))!.status,
			credential: await rotated.credential(connector.id)
		}).toEqual({ status: { kind: 'unreadable' }, credential: { kind: 'unreadable' } });
	});

	it('keeps a tool policy across a refresh and drops tools the server stopped listing', async () => {
		const { records, connector } = await seedConnector('61004');
		await records.replaceTools(
			connector.id,
			[entry(listed('list_issues', true)), entry(listed('create_issue', false))],
			new Date('2026-11-14T10:01:00Z')
		);
		await records.setToolPolicy(connector.id, 'create_issue', { kind: 'chosen', choice: 'allow' });
		await records.replaceTools(
			connector.id,
			[entry({ ...listed('create_issue', false), checksum: 'create_issue-v2' })],
			new Date('2026-11-14T10:02:00Z')
		);
		const tools = await records.tools({ kind: 'connector', connectorId: connector.id });
		expect({
			tools: tools.map((tool) => ({
				name: tool.serverName,
				policy: tool.policy,
				checksum: tool.checksum
			})),
			refreshedAt: (await records.find(connector.id))!.toolsRefreshedAt
		}).toEqual({
			tools: [
				{
					name: 'create_issue',
					policy: { kind: 'chosen', choice: 'allow' },
					checksum: 'create_issue-v2'
				}
			],
			refreshedAt: '2026-11-14T10:02:00.000Z'
		});
	});

	it('marks reauthorization with a reason and clears it when a new credential arrives', async () => {
		const { records, connector } = await seedConnector('61005');
		await records.requireReauthorization(connector.id, 'The refresh token was revoked.');
		const needing = (await records.find(connector.id))!.status;
		await records.replaceCredential(connector.id, oauth);
		expect({
			needing: needing.kind === 'reauthorization_required' ? needing.reason : needing.kind,
			after: (await records.find(connector.id))!.status
		}).toEqual({ needing: 'The refresh token was revoked.', after: { kind: 'connected' } });
	});

	it('removes a connector with its tools', async () => {
		const { records, connector } = await seedConnector('61006');
		await records.replaceTools(connector.id, [entry(listed('list_issues', true))], new Date());
		await records.remove(connector.id);
		const rows = await context.db
			.select()
			.from(schema.connectorTools)
			.where(eq(schema.connectorTools.connectorId, connector.id));
		expect(rows).toEqual([]);
	});

	it('refuses a row that breaks the source, credential or status unions', async () => {
		const owner = await seedUser('61007');
		const base = {
			userId: owner.userId,
			slug: 'broken',
			title: 'Broken',
			serverUrl: 'https://mcp.example.com/mcp',
			toolsRefreshedAt: new Date()
		};
		const attempts = [
			{
				...base,
				id: connectorId('61071'),
				sourceKind: 'catalog',
				catalogId: null,
				authKind: 'none',
				status: 'connected'
			},
			{
				...base,
				id: connectorId('61072'),
				sourceKind: 'custom',
				authKind: 'bearer',
				sealedCredential: null,
				status: 'connected'
			},
			{
				...base,
				id: connectorId('61073'),
				sourceKind: 'custom',
				authKind: 'none',
				status: 'reauthorization_required'
			}
		];
		for (const values of attempts)
			await expect(context.db.insert(schema.connectors).values(values)).rejects.toThrow();
	});
});

describe('connector authorizations', () => {
	const pending: PendingAuthorization = {
		target: { kind: 'new', source: { kind: 'catalog', catalogId: 'linear' }, title: 'Linear' },
		serverUrl: 'https://mcp.linear.app/mcp',
		grant,
		codeVerifier: 'verifier-secret',
		redirectUri: 'https://followthrough.example/connectors/callback'
	};

	it('hands an attempt back once, to its own user, before it expires', async () => {
		const owner = await seedUser('61011');
		const records = new ConnectorAuthorizationRecords(owner, context.db, box);
		const stranger = new ConnectorAuthorizationRecords(await seedUser('61012'), context.db, box);
		const now = new Date('2026-11-14T10:00:00Z');
		await records.insert('state-a', pending, new Date('2026-11-14T10:10:00Z'));
		await records.insert('state-b', pending, new Date('2026-11-14T09:59:00Z'));
		expect({
			stranger: await stranger.take('state-a', now),
			expired: await records.take('state-b', now),
			first: await records.take('state-a', now),
			replay: await records.take('state-a', now)
		}).toEqual({
			stranger: { kind: 'missing' },
			expired: { kind: 'expired' },
			first: { kind: 'found', request: pending },
			replay: { kind: 'missing' }
		});
	});
});
