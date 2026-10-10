import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { randomUUID } from 'node:crypto';
import type { AgentFileContentMeasurement } from '$lib/models/agent-files';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import type { ActorContext } from '$lib/models/identity';
import type { AgentFileId, StoredAgentFile, StoreAgentFileInput } from '$lib/models/agent-files';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';

export class InMemoryAgentFiles implements AgentFileRepository {
	constructor(
		private readonly measurement: AgentFileContentMeasurement = new AgentFileContentMeter(
			testTokenizer
		)
	) {}
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
				...this.measurement.measure(input.content)
			},
			content: input.content
		};
		this.owners.set(file.metadata.id, _actor.userId);
		this.files = [...this.files.filter((candidate) => candidate !== existing), file];
		return file;
	}
}
