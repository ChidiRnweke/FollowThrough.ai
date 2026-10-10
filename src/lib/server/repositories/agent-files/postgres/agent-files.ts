import { and, eq } from 'drizzle-orm';
import type { AgentFileContentMeasurement } from '$lib/models/agent-files';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileId, StoredAgentFile, StoreAgentFileInput } from '$lib/models/agent-files';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/agent';

const toStoredFile = (row: typeof schema.agentFiles.$inferSelect): StoredAgentFile => ({
	conversationId: row.conversationId as StoredAgentFile['conversationId'],
	metadata: {
		kind: 'file',
		id: row.id as AgentFileId,
		path: row.path,
		mediaType: row.mediaType,
		byteSize: row.byteSize,
		tokenCount: row.tokenCount,
		lineCount: row.lineCount,
		checksumSha256: row.checksumSha256
	},
	content: row.content
});

export class AgentFileRecords implements AgentFileRepository {
	constructor(
		private readonly database: Database,
		private readonly measurement: AgentFileContentMeasurement
	) {}

	async list(actor: ActorContext): Promise<readonly StoredAgentFile[]> {
		return (
			await this.database
				.select()
				.from(schema.agentFiles)
				.where(eq(schema.agentFiles.userId, actor.userId))
		).map(toStoredFile);
	}

	async findByPath(actor: ActorContext, path: string): Promise<StoredAgentFile | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.agentFiles)
			.where(and(eq(schema.agentFiles.userId, actor.userId), eq(schema.agentFiles.path, path)));
		return row ? toStoredFile(row) : undefined;
	}

	async store(actor: ActorContext, input: StoreAgentFileInput): Promise<StoredAgentFile> {
		const values = {
			userId: actor.userId,
			conversationId: input.conversationId,
			path: input.path,
			mediaType: input.mediaType,
			content: input.content,
			...this.measurement.measure(input.content),
			updatedAt: new Date()
		};
		const [row] = await this.database
			.insert(schema.agentFiles)
			.values(values)
			.onConflictDoUpdate({
				target: [schema.agentFiles.conversationId, schema.agentFiles.path],
				set: values
			})
			.returning();
		return toStoredFile(row!);
	}
}
