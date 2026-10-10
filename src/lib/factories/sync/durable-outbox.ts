import { SyncResourceRulesService } from '$lib/services/sync/state';
import { OutboxEditingService, OutboxDeliveryService } from '$lib/services/sync/state';
import { createWriteAncestry } from './ancestry';
import type { WriteRebase } from '$lib/models/outbox';
import { DurableOutbox, type OutboxStorage } from '$lib/controllers/sync/durable-outbox';
import type { DurableWriteController } from '$lib/controllers/sync/submission';
export const createDurableOutbox = <C, T>(
	storage: OutboxStorage<C, T>,
	rebase: WriteRebase<T>
): DurableWriteController<C, T> =>
	new DurableOutbox(
		new SyncResourceRulesService(),
		storage,
		createWriteAncestry(rebase),
		new OutboxEditingService(),
		new OutboxDeliveryService()
	);
