import { createHash, randomUUID } from 'node:crypto';
import { getEncoding } from 'js-tiktoken';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileId, StoredAgentFile, StoreAgentFileInput } from '$lib/models/agent-files';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';

const encoding = getEncoding('cl100k_base');

export class InMemoryAgentFiles implements AgentFileRepository {
	files: StoredAgentFile[] = [];
	private readonly owners = new Map<AgentFileId, ActorContext['userId']>();

	async list(actor: ActorContext): Promise<readonly StoredAgentFile[]> {
		return this.files.filter((file) => this.owners.get(file.metadata.id) === actor.userId);
	}

	async findByPath(actor: ActorContext, path: string): Promise<StoredAgentFile | undefined> {
		return (await this.list(actor)).find((file) => file.metadata.path === path);
	}

	async store(_actor: ActorContext, input: StoreAgentFileInput): Promise<StoredAgentFile> {
		const existing = this.files.find(
			(file) =>
				file.conversationId === input.conversationId &&
				file.metadata.path === input.path &&
				this.owners.get(file.metadata.id) === _actor.userId
		);
		const file: StoredAgentFile = {
			conversationId: input.conversationId,
			metadata: {
				kind: 'file',
				id: existing?.metadata.id ?? (randomUUID() as AgentFileId),
				path: input.path,
				mediaType: input.mediaType,
				byteSize: Buffer.byteLength(input.content, 'utf8'),
				tokenCount: encoding.encode(input.content).length,
				lineCount: input.content.length === 0 ? 0 : input.content.split('\n').length,
				checksumSha256: createHash('sha256').update(input.content).digest('hex')
			},
			content: input.content
		};
		this.owners.set(file.metadata.id, _actor.userId);
		this.files = [...this.files.filter((candidate) => candidate !== existing), file];
		return file;
	}
}
