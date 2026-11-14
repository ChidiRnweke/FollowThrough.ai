import { randomUUID } from 'node:crypto';
import { and, asc, cosineDistance, eq, inArray, lte, ne, notInArray, sql } from 'drizzle-orm';
import type { ToolDistance } from '$lib/models/agent/tool-index';
import { NotFoundError } from '$lib/errors';
import { agentPayloadObjectSchema } from '$lib/models/agent/payload';
import {
	connectorAuthenticationKindSchema,
	connectorCredentialSchema,
	connectorSlugSchema,
	connectorSourceSchema,
	connectorToolHintsSchema,
	connectorToolNameSchema,
	connectorToolPolicyChoiceSchema,
	pendingAuthorizationSchema,
	type Connector,
	type ConnectorCredential,
	type ConnectorCredentialRead,
	type ConnectorId,
	type ConnectorStatus,
	type ConnectorTool,
	type ConnectorToolPolicy,
	type NamedSnapshotEntry,
	type NewConnector,
	type PendingAuthorization,
	type RunConnectorTool,
	type ToolScope
} from '$lib/models/connectors';
import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/connectors';
import type { SecretSealing } from '$lib/server/infrastructure/crypto/secret-box';
import type {
	ConnectorAuthorizationRepository,
	ConnectorRepository,
	TakenAuthorization
} from '$lib/server/repositories/connectors';

type DateTime = Connector['createdAt'];
type ConnectorRow = typeof schema.connectors.$inferSelect;
type ToolRow = Omit<typeof schema.connectorTools.$inferSelect, 'embedding' | 'embeddingModel'>;

const instant = (value: Date): DateTime => value.toISOString() as DateTime;

const credentialContext = (id: ConnectorId, userId: string) =>
	`connector:${id}:${userId}:credential`;

/** Every column of a tool except its vector, which only search reads. */
const toolColumns = {
	connectorId: schema.connectorTools.connectorId,
	serverName: schema.connectorTools.serverName,
	modelName: schema.connectorTools.modelName,
	title: schema.connectorTools.title,
	description: schema.connectorTools.description,
	inputSchema: schema.connectorTools.inputSchema,
	unusableReason: schema.connectorTools.unusableReason,
	hints: schema.connectorTools.hints,
	checksum: schema.connectorTools.checksum,
	policy: schema.connectorTools.policy,
	createdAt: schema.connectorTools.createdAt,
	updatedAt: schema.connectorTools.updatedAt
};

/** The table's check constraint stores exactly one of the schema and the reason. */
const toolSchema = (row: ToolRow): ConnectorTool['schema'] => {
	if (row.inputSchema !== null)
		return { kind: 'usable', inputSchema: agentPayloadObjectSchema.parse(row.inputSchema) };
	if (row.unusableReason !== null) return { kind: 'unusable', reason: row.unusableReason };
	throw new Error(`Connector tool ${row.serverName} stores neither a schema nor a reason`);
};

const toTool = (row: ToolRow): ConnectorTool => ({
	connectorId: row.connectorId as ConnectorId,
	serverName: row.serverName,
	modelName: connectorToolNameSchema.parse(row.modelName),
	title: row.title,
	description: row.description,
	schema: toolSchema(row),
	hints: connectorToolHintsSchema.parse(row.hints),
	checksum: row.checksum,
	policy:
		row.policy === null
			? { kind: 'default' }
			: { kind: 'chosen', choice: connectorToolPolicyChoiceSchema.parse(row.policy) }
});

export class ConnectorRecords implements ConnectorRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database,
		private readonly secrets: SecretSealing
	) {}

	async list(): Promise<readonly Connector[]> {
		const rows = await this.database
			.select()
			.from(schema.connectors)
			.where(eq(schema.connectors.userId, this.actor.userId))
			.orderBy(asc(schema.connectors.createdAt));
		return rows.map((row) => this.toConnector(row));
	}

	async find(id: ConnectorId): Promise<Connector | undefined> {
		const row = await this.row(id);
		return row ? this.toConnector(row) : undefined;
	}

	async insert(connector: NewConnector, refreshedAt: Date): Promise<Connector> {
		const [row] = await this.database
			.insert(schema.connectors)
			.values({
				id: connector.id,
				userId: this.actor.userId,
				slug: connector.slug,
				sourceKind: connector.source.kind,
				catalogId: connector.source.kind === 'catalog' ? connector.source.catalogId : null,
				title: connector.title,
				serverUrl: connector.serverUrl,
				authKind: connector.credential.kind,
				sealedCredential:
					connector.credential.kind === 'none'
						? null
						: this.seal(connector.id, connector.credential),
				status: 'connected',
				toolsRefreshedAt: refreshedAt
			})
			.returning();
		return this.toConnector(row!);
	}

	async credential(id: ConnectorId): Promise<ConnectorCredentialRead> {
		const row = await this.row(id);
		if (!row) throw new NotFoundError('Connector not found');
		if (row.sealedCredential === null) return { kind: 'none' };
		const opened = this.secrets.open(
			row.sealedCredential,
			credentialContext(id, this.actor.userId)
		);
		if (opened.kind === 'unknown_key') return { kind: 'unreadable' };
		const credential = connectorCredentialSchema.parse(JSON.parse(opened.plaintext));
		if (credential.kind !== row.authKind)
			throw new Error(`Connector ${id} stores a ${credential.kind} credential for ${row.authKind}`);
		return { kind: 'readable', credential };
	}

	async replaceCredential(id: ConnectorId, credential: ConnectorCredential): Promise<void> {
		const updated = await this.database
			.update(schema.connectors)
			.set({
				authKind: credential.kind,
				sealedCredential: this.seal(id, credential),
				status: 'connected',
				statusReason: null,
				statusChangedAt: new Date()
			})
			.where(this.owned(id))
			.returning({ id: schema.connectors.id });
		if (updated.length === 0) throw new NotFoundError('Connector not found');
	}

	async requireReauthorization(id: ConnectorId, reason: string): Promise<void> {
		await this.database
			.update(schema.connectors)
			.set({
				status: 'reauthorization_required',
				statusReason: reason,
				statusChangedAt: new Date()
			})
			.where(this.owned(id));
	}

	async remove(id: ConnectorId): Promise<boolean> {
		const removed = await this.database
			.delete(schema.connectors)
			.where(this.owned(id))
			.returning({ id: schema.connectors.id });
		return removed.length > 0;
	}

	async tools(scope: ToolScope): Promise<readonly ConnectorTool[]> {
		const owned = this.database
			.select({ id: schema.connectors.id })
			.from(schema.connectors)
			.where(
				scope.kind === 'all'
					? eq(schema.connectors.userId, this.actor.userId)
					: this.owned(scope.connectorId)
			);
		const rows = await this.database
			.select(toolColumns)
			.from(schema.connectorTools)
			.where(inArray(schema.connectorTools.connectorId, owned))
			.orderBy(asc(schema.connectorTools.connectorId), asc(schema.connectorTools.serverName));
		return rows.map(toTool);
	}

	async replaceTools(
		id: ConnectorId,
		entries: readonly NamedSnapshotEntry[],
		refreshedAt: Date
	): Promise<void> {
		if (!(await this.row(id))) throw new NotFoundError('Connector not found');
		const tools = schema.connectorTools;
		await this.database.delete(tools).where(
			entries.length === 0
				? eq(tools.connectorId, id)
				: and(
						eq(tools.connectorId, id),
						notInArray(
							tools.serverName,
							entries.map((entry) => entry.tool.serverName)
						)
					)
		);
		if (entries.length > 0)
			await this.database
				.insert(tools)
				.values(
					entries.map((entry) => ({
						connectorId: id,
						serverName: entry.tool.serverName,
						modelName: entry.modelName,
						title: entry.tool.title,
						description: entry.tool.description,
						inputSchema: entry.tool.schema.kind === 'usable' ? entry.tool.schema.inputSchema : null,
						unusableReason: entry.tool.schema.kind === 'unusable' ? entry.tool.schema.reason : null,
						hints: entry.tool.hints,
						checksum: entry.tool.checksum,
						embedding: entry.kind === 'usable' ? [...entry.embedding] : null,
						embeddingModel: entry.kind === 'usable' ? entry.embeddingModel : null
					}))
				)
				.onConflictDoUpdate({
					target: [tools.connectorId, tools.serverName],
					set: {
						modelName: sql`excluded.model_name`,
						title: sql`excluded.title`,
						description: sql`excluded.description`,
						inputSchema: sql`excluded.input_schema`,
						unusableReason: sql`excluded.unusable_reason`,
						hints: sql`excluded.hints`,
						checksum: sql`excluded.checksum`,
						embedding: sql`excluded.embedding`,
						embeddingModel: sql`excluded.embedding_model`,
						updatedAt: sql`now()`
					}
				});
		await this.database
			.update(schema.connectors)
			.set({ toolsRefreshedAt: refreshedAt })
			.where(this.owned(id));
	}

	async setToolPolicy(
		id: ConnectorId,
		serverName: string,
		policy: ConnectorToolPolicy
	): Promise<ConnectorTool | undefined> {
		if (!(await this.row(id))) return undefined;
		const [row] = await this.database
			.update(schema.connectorTools)
			.set({ policy: policy.kind === 'chosen' ? policy.choice : null })
			.where(
				and(
					eq(schema.connectorTools.connectorId, id),
					eq(schema.connectorTools.serverName, serverName)
				)
			)
			.returning(toolColumns);
		return row ? toTool(row) : undefined;
	}

	async runTools(): Promise<readonly RunConnectorTool[]> {
		const rows = await this.database
			.select({ ...toolColumns, connectorTitle: schema.connectors.title })
			.from(schema.connectorTools)
			.innerJoin(schema.connectors, eq(schema.connectors.id, schema.connectorTools.connectorId))
			.where(eq(schema.connectors.userId, this.actor.userId))
			.orderBy(asc(schema.connectorTools.modelName));
		return rows.map(({ connectorTitle, ...row }) => ({ tool: toTool(row), connectorTitle }));
	}

	async toolDistances(
		vector: readonly number[],
		names: readonly string[],
		model: string
	): Promise<readonly ToolDistance[]> {
		if (names.length === 0) return [];
		const distance = cosineDistance(schema.connectorTools.embedding, [...vector]);
		const rows = await this.database
			.select({ name: schema.connectorTools.modelName, distance })
			.from(schema.connectorTools)
			.innerJoin(schema.connectors, eq(schema.connectors.id, schema.connectorTools.connectorId))
			.where(
				and(
					eq(schema.connectors.userId, this.actor.userId),
					inArray(schema.connectorTools.modelName, [...names]),
					eq(schema.connectorTools.embeddingModel, model)
				)
			);
		return rows.map((row) => ({ name: row.name, distance: Number(row.distance) }));
	}

	private owned(id: ConnectorId) {
		return and(eq(schema.connectors.id, id), eq(schema.connectors.userId, this.actor.userId));
	}

	private async row(id: ConnectorId): Promise<ConnectorRow | undefined> {
		const [row] = await this.database.select().from(schema.connectors).where(this.owned(id));
		return row;
	}

	private seal(id: ConnectorId, credential: ConnectorCredential): string {
		return this.secrets.seal(JSON.stringify(credential), credentialContext(id, this.actor.userId));
	}

	private toConnector(row: ConnectorRow): Connector {
		const id = row.id as ConnectorId;
		return {
			id,
			slug: connectorSlugSchema.parse(row.slug),
			source: connectorSourceSchema.parse(
				row.sourceKind === 'catalog'
					? { kind: 'catalog', catalogId: row.catalogId }
					: { kind: row.sourceKind }
			),
			title: row.title,
			serverUrl: row.serverUrl,
			authentication: connectorAuthenticationKindSchema.parse(row.authKind),
			status: this.status(row),
			toolsRefreshedAt: instant(row.toolsRefreshedAt),
			createdAt: instant(row.createdAt)
		};
	}

	private status(row: ConnectorRow): ConnectorStatus {
		if (
			row.sealedCredential !== null &&
			this.secrets.open(row.sealedCredential, credentialContext(row.id as ConnectorId, row.userId))
				.kind === 'unknown_key'
		)
			return { kind: 'unreadable' };
		if (row.status === 'connected') return { kind: 'connected' };
		if (row.status === 'reauthorization_required' && row.statusReason !== null)
			return {
				kind: 'reauthorization_required',
				reason: row.statusReason,
				since: instant(row.statusChangedAt)
			};
		throw new Error(`Connector ${row.id} has an unreadable status ${row.status}`);
	}
}

const authorizationContext = (id: string, userId: string) =>
	`connector-authorization:${id}:${userId}`;

export class ConnectorAuthorizationRecords implements ConnectorAuthorizationRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database,
		private readonly secrets: SecretSealing
	) {}

	async insert(stateHash: string, request: PendingAuthorization, expiresAt: Date): Promise<void> {
		const id = randomUUID();
		await this.database.insert(schema.connectorAuthorizations).values({
			id,
			userId: this.actor.userId,
			stateHash,
			sealedRequest: this.secrets.seal(
				JSON.stringify(request),
				authorizationContext(id, this.actor.userId)
			),
			expiresAt
		});
	}

	async take(stateHash: string, now: Date): Promise<TakenAuthorization> {
		const attempts = schema.connectorAuthorizations;
		// Expired attempts of this user go with this one, so abandoned sign-ins do not accumulate.
		await this.database
			.delete(attempts)
			.where(
				and(
					eq(attempts.userId, this.actor.userId),
					lte(attempts.expiresAt, now),
					ne(attempts.stateHash, stateHash)
				)
			);
		const [row] = await this.database
			.delete(attempts)
			.where(and(eq(attempts.stateHash, stateHash), eq(attempts.userId, this.actor.userId)))
			.returning();
		if (!row) return { kind: 'missing' };
		if (row.expiresAt <= now) return { kind: 'expired' };
		const opened = this.secrets.open(row.sealedRequest, authorizationContext(row.id, row.userId));
		if (opened.kind === 'unknown_key')
			throw new Error('A connector authorization was sealed under a key this deployment lacks');
		return {
			kind: 'found',
			request: pendingAuthorizationSchema.parse(JSON.parse(opened.plaintext))
		};
	}
}
