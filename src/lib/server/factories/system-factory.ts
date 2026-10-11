import type { ScheduledTask } from '$lib/models/maintenance';
import {
	AttachmentBacklogReader,
	type AttachmentBacklogController
} from '$lib/server/controllers/attachments/backlog';
import type { EmbeddingBacklogController } from '$lib/server/controllers/knowledge-indexing/controller';
import { RunRecovery, type RunRecoveryController } from '$lib/server/controllers/agent/recovery';
import { AgentRunBacklogRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { RunBacklogService } from '$lib/server/services/agent/runs/backlog';
import type { ApplicationConfig } from '$lib/server/application';
import { createAttachmentMaintenance } from './capabilities/attachments-capability-factory';
import { createEmbeddingBacklog } from './capabilities/knowledge-search-capability-factory';

/** Controllers for work that acts for no user: they list work and say whose it is. */
export interface SystemControllers {
	runRecovery(): RunRecoveryController;
	embeddingBacklog(): EmbeddingBacklogController;
	attachmentBacklog(): AttachmentBacklogController;
}

export interface SystemApplication {
	readonly controllers: SystemControllers;
	/** Worker tasks that belong to no user. */
	readonly tasks: readonly ScheduledTask[];
}

/**
 * The composition for startup recovery and the worker. Work owned by a user is listed here and
 * then run through that user's composition, so no system class ever holds an actor.
 */
export const createSystemApplication = (config: ApplicationConfig): SystemApplication => {
	const attachments = createAttachmentMaintenance({
		db: config.db,
		...(config.s3 ? { s3: config.s3 } : {}),
		...(config.overrides?.attachmentStorage ? { storage: config.overrides.attachmentStorage } : {})
	});
	return {
		controllers: {
			runRecovery: () =>
				new RunRecovery(new RunBacklogService(new AgentRunBacklogRecords(config.db))),
			embeddingBacklog: () => createEmbeddingBacklog(config.db),
			attachmentBacklog: () => new AttachmentBacklogReader(attachments.backlog)
		},
		tasks: attachments.tasks
	};
};
